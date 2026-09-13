import { supabase } from './supabase';

type Editor = HTMLInputElement | HTMLTextAreaElement;
type TokenKind = 'mention' | 'hashtag';

type ActiveToken = {
  kind: TokenKind;
  query: string;
  start: number;
  end: number;
};

type MentionSuggestion = {
  kind: 'mention';
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  verified: boolean;
};

type HashtagSuggestion = {
  kind: 'hashtag';
  tag: string;
  usageCount: number;
  isNew?: boolean;
};

type Suggestion = MentionSuggestion | HashtagSuggestion;

type MentionContext = {
  communityId: string | null;
  conversationId: string | null;
};

const ROOT_ID = 'dright-social-token-suggestions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const communityCache = new Map<string, string | null>();

let activeEditor: Editor | null = null;
let activeToken: ActiveToken | null = null;
let suggestions: Suggestion[] = [];
let selectedIndex = 0;
let requestSequence = 0;
let debounceTimer: number | null = null;

function isEligibleEditor(node: EventTarget | null): node is Editor {
  if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return false;
  if (node.disabled || node.readOnly) return false;
  if (node.dataset.socialTokens === 'false') return false;
  if (node.dataset.socialTokens === 'true') return true;
  if (node instanceof HTMLTextAreaElement) return true;

  const type = (node.type || 'text').toLowerCase();
  if (!['text', 'search'].includes(type)) return false;
  const hint = `${node.name || ''} ${node.id || ''} ${node.placeholder || ''} ${node.getAttribute('aria-label') || ''}`.toLowerCase();
  return /(comment|reply|message|caption|description|post|share|write|chat|bio|text)/.test(hint);
}

function readActiveToken(editor: Editor): ActiveToken | null {
  const caret = editor.selectionStart;
  if (caret == null) return null;
  const head = editor.value.slice(0, caret);

  const mention = head.match(/(^|[^A-Za-z0-9_.-])@([A-Za-z0-9_.-]{0,64})$/);
  if (mention) {
    const raw = `@${mention[2]}`;
    return { kind: 'mention', query: mention[2], start: caret - raw.length, end: caret };
  }

  const hashtag = head.match(/(^|[^A-Za-z0-9_])#([A-Za-z0-9_]{0,64})$/);
  if (hashtag) {
    const raw = `#${hashtag[2]}`;
    return { kind: 'hashtag', query: hashtag[2], start: caret - raw.length, end: caret };
  }

  return null;
}

function getRoot(): HTMLDivElement {
  let root = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (root) return root;

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('role', 'listbox');
  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '2147483000',
    display: 'none',
    minWidth: '220px',
    maxWidth: '380px',
    maxHeight: '320px',
    overflowY: 'auto',
    padding: '6px',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '14px',
    background: 'rgba(13,16,23,.98)',
    boxShadow: '0 18px 55px rgba(0,0,0,.45)',
    backdropFilter: 'blur(18px)',
    color: '#fff',
    fontFamily: 'inherit',
  });
  document.body.appendChild(root);
  return root;
}

function hide() {
  const root = document.getElementById(ROOT_ID);
  if (root) root.style.display = 'none';
  suggestions = [];
  selectedIndex = 0;
  activeToken = null;
}

function compactCount(value: number): string {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1_000_000_000) return `${trimZero(count / 1_000_000_000)}B`;
  if (count >= 1_000_000) return `${trimZero(count / 1_000_000)}M`;
  if (count >= 1_000) return `${trimZero(count / 1_000)}K`;
  return String(count);
}

function trimZero(value: number): string {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(digits).replace(/\.0+$|(?<=\.[0-9])0+$/, '');
}

function positionRoot(editor: Editor, root: HTMLDivElement) {
  const rect = editor.getBoundingClientRect();
  const width = Math.max(220, Math.min(380, rect.width || 320));
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
  const estimatedHeight = Math.min(320, 16 + Math.max(1, suggestions.length) * 58);
  const roomBelow = window.innerHeight - rect.bottom;
  const top = roomBelow >= Math.min(180, estimatedHeight)
    ? rect.bottom + 6
    : Math.max(8, rect.top - estimatedHeight - 6);
  root.style.width = `${width}px`;
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
}

function rowBase(selected: boolean): Partial<CSSStyleDeclaration> {
  return {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 10px',
    border: '0',
    borderRadius: '10px',
    background: selected ? 'rgba(67,83,255,.24)' : 'transparent',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
  };
}

function makeAvatar(item: MentionSuggestion): HTMLElement {
  if (item.avatarUrl) {
    const image = document.createElement('img');
    image.src = item.avatarUrl;
    image.alt = '';
    Object.assign(image.style, { width: '34px', height: '34px', borderRadius: '999px', objectFit: 'cover', flex: '0 0 auto' });
    return image;
  }
  const fallback = document.createElement('span');
  fallback.textContent = (item.fullName || item.username || 'D').slice(0, 1).toUpperCase();
  Object.assign(fallback.style, {
    width: '34px', height: '34px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(255,255,255,.1)', fontSize: '12px', fontWeight: '800', flex: '0 0 auto',
  });
  return fallback;
}

function render() {
  if (!activeEditor || !activeToken) return hide();
  const root = getRoot();
  root.replaceChildren();

  if (!suggestions.length) {
    const empty = document.createElement('div');
    empty.textContent = activeToken.kind === 'mention' ? 'No matching users' : 'No hashtags found';
    Object.assign(empty.style, { padding: '11px 12px', fontSize: '13px', color: '#9ca3af' });
    root.appendChild(empty);
  } else {
    suggestions.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === selectedIndex));
      Object.assign(button.style, rowBase(index === selectedIndex));
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        selectedIndex = index;
        applySuggestion(item);
      });
      button.addEventListener('pointerenter', () => {
        selectedIndex = index;
        render();
      });

      if (item.kind === 'mention') {
        button.appendChild(makeAvatar(item));
        const copy = document.createElement('span');
        Object.assign(copy.style, { minWidth: '0', display: 'block' });
        const name = document.createElement('span');
        name.textContent = `${item.fullName || item.username}${item.verified ? ' ✓' : ''}`;
        Object.assign(name.style, { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: '700' });
        const username = document.createElement('span');
        username.textContent = `@${item.username}`;
        Object.assign(username.style, { display: 'block', marginTop: '2px', color: '#9ca3af', fontSize: '12px' });
        copy.append(name, username);
        button.appendChild(copy);
      } else {
        const icon = document.createElement('span');
        icon.textContent = '#';
        Object.assign(icon.style, { width: '34px', height: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: item.isNew ? 'rgba(67,83,255,.22)' : 'rgba(255,255,255,.08)', color: item.isNew ? '#aeb6ff' : '#fff', fontSize: '18px', fontWeight: '900', flex: '0 0 auto' });
        const copy = document.createElement('span');
        Object.assign(copy.style, { minWidth: '0', display: 'block', flex: '1' });
        const tag = document.createElement('span');
        tag.textContent = item.isNew ? `Use #${item.tag}` : `#${item.tag}`;
        Object.assign(tag.style, { display: 'block', fontSize: '13px', fontWeight: '800' });
        const usage = document.createElement('span');
        usage.textContent = item.isNew ? 'Counted only after the post is published' : `${compactCount(item.usageCount)} ${item.usageCount === 1 ? 'use' : 'uses'}`;
        Object.assign(usage.style, { display: 'block', marginTop: '2px', color: '#9ca3af', fontSize: '12px' });
        copy.append(tag, usage);
        button.append(icon, copy);
      }
      root.appendChild(button);
    });
  }

  positionRoot(activeEditor, root);
  root.style.display = 'block';
}

function setReactControlledValue(editor: Editor, value: string) {
  const proto = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(editor, value);
  else editor.value = value;
  editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

function applySuggestion(item: Suggestion) {
  if (!activeEditor || !activeToken) return;
  const editor = activeEditor;
  const token = activeToken;
  const replacement = item.kind === 'mention' ? `@${item.username}` : `#${item.tag}`;
  const next = `${editor.value.slice(0, token.start)}${replacement} ${editor.value.slice(token.end)}`;
  const caret = token.start + replacement.length + 1;
  setReactControlledValue(editor, next);
  editor.focus();
  window.requestAnimationFrame(() => editor.setSelectionRange(caret, caret));
  hide();
}

async function resolveCommunityId(editor: Editor): Promise<string | null> {
  const scoped = editor.closest<HTMLElement>('[data-community-id]')?.dataset.communityId;
  if (scoped && UUID_RE.test(scoped)) return scoped;

  const params = new URLSearchParams(window.location.search);
  const queryValue = params.get('community_id') || params.get('community');
  if (queryValue && UUID_RE.test(queryValue)) return queryValue;

  const match = window.location.pathname.match(/\/communities\/([^/?#]+)/i);
  if (!match) return null;
  const part = decodeURIComponent(match[1]);
  if (UUID_RE.test(part)) return part;
  if (['new', 'create', 'discover', 'mine', 'joined'].includes(part.toLowerCase())) return null;
  if (communityCache.has(part)) return communityCache.get(part) ?? null;

  const { data, error } = await supabase.rpc('get_community_by_slug', { p_slug: part });
  const value = !error && data && typeof data === 'object' && 'id' in data ? String((data as { id?: unknown }).id || '') : '';
  const id = UUID_RE.test(value) ? value : null;
  communityCache.set(part, id);
  return id;
}

async function resolveContext(editor: Editor): Promise<MentionContext> {
  const scopedConversation = editor.closest<HTMLElement>('[data-conversation-id]')?.dataset.conversationId;
  const params = new URLSearchParams(window.location.search);
  const queryConversation = params.get('conv') || params.get('conversation') || params.get('conversation_id');
  const conversationId = scopedConversation && UUID_RE.test(scopedConversation)
    ? scopedConversation
    : queryConversation && UUID_RE.test(queryConversation)
      ? queryConversation
      : null;
  const communityId = conversationId ? null : await resolveCommunityId(editor);
  return { communityId, conversationId };
}

async function loadSuggestions(editor: Editor, token: ActiveToken, sequence: number) {
  try {
    if (token.kind === 'hashtag') {
      const { data, error } = await supabase.rpc('search_hashtags', { p_query: token.query, p_limit: 10 });
      if (sequence !== requestSequence || activeEditor !== editor) return;
      if (error) {
        suggestions = [];
        return render();
      }
      const rows = Array.isArray(data) ? data : [];
      const normalized = token.query.toLowerCase();
      const mapped: HashtagSuggestion[] = rows.map((row: Record<string, unknown>) => ({
        kind: 'hashtag',
        tag: String(row.tag || ''),
        usageCount: Number(row.usage_count || 0),
      })).filter((item) => item.tag);
      if (normalized && /^[A-Za-z0-9_]{1,64}$/.test(normalized) && !mapped.some((item) => item.tag.toLowerCase() === normalized)) {
        mapped.push({ kind: 'hashtag', tag: normalized, usageCount: 0, isNew: true });
      }
      suggestions = mapped;
      selectedIndex = 0;
      return render();
    }

    const context = await resolveContext(editor);
    if (sequence !== requestSequence || activeEditor !== editor) return;
    const { data, error } = await supabase.rpc('search_social_mentions', {
      p_query: token.query,
      p_community_id: context.communityId,
      p_conversation_id: context.conversationId,
      p_limit: 10,
    });
    if (sequence !== requestSequence || activeEditor !== editor) return;
    if (error) {
      suggestions = [];
      return render();
    }
    const rows = Array.isArray(data) ? data : [];
    suggestions = rows.map((row: Record<string, unknown>): MentionSuggestion => ({
      kind: 'mention',
      userId: String(row.user_id || ''),
      username: String(row.username || ''),
      fullName: row.full_name == null ? null : String(row.full_name),
      avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
      verified: Boolean(row.is_verified),
    })).filter((item) => item.userId && item.username);
    selectedIndex = 0;
    render();
  } catch {
    if (sequence === requestSequence) {
      suggestions = [];
      render();
    }
  }
}

function schedule(editor: Editor) {
  const token = readActiveToken(editor);
  activeEditor = editor;
  activeToken = token;
  if (debounceTimer != null) window.clearTimeout(debounceTimer);
  if (!token) return hide();
  const sequence = ++requestSequence;
  debounceTimer = window.setTimeout(() => void loadSuggestions(editor, token, sequence), 130);
}

function handleInput(event: Event) {
  if (!isEligibleEditor(event.target)) return;
  schedule(event.target);
}

function handleKeyDown(event: KeyboardEvent) {
  if (!isEligibleEditor(event.target)) return;
  if (!activeToken || activeEditor !== event.target || !suggestions.length) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedIndex = (selectedIndex + 1) % suggestions.length;
    render();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
    render();
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    applySuggestion(suggestions[selectedIndex]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    hide();
  }
}

function handleSelection(event: Event) {
  if (!isEligibleEditor(event.target)) return;
  if (activeEditor === event.target) schedule(event.target);
}

function handleDocumentPointer(event: PointerEvent) {
  const root = document.getElementById(ROOT_ID);
  if (root?.contains(event.target as Node)) return;
  if (event.target === activeEditor) return;
  hide();
}

function reposition() {
  const root = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (root && root.style.display !== 'none' && activeEditor) positionRoot(activeEditor, root);
}

if (typeof document !== 'undefined') {
  document.addEventListener('input', handleInput, true);
  document.addEventListener('click', handleSelection, true);
  document.addEventListener('keyup', handleSelection, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('pointerdown', handleDocumentPointer, true);
  window.addEventListener('resize', reposition, { passive: true });
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('popstate', hide);
}
