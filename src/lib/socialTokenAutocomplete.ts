import { supabase } from './supabase';

type Editor = HTMLInputElement | HTMLTextAreaElement;
type ActiveToken = { kind: 'mention' | 'hashtag'; query: string; start: number; end: number };
type MentionItem = { kind: 'mention'; userId: string; username: string; fullName: string | null; avatarUrl: string | null; verified: boolean };
type HashtagItem = { kind: 'hashtag'; tag: string; usageCount: number; isNew?: boolean };
type Suggestion = MentionItem | HashtagItem;

const ROOT_ID = 'dright-social-token-suggestions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const communityCache = new Map<string, string | null>();
let editor: Editor | null = null;
let token: ActiveToken | null = null;
let items: Suggestion[] = [];
let selected = 0;
let requestId = 0;
let timer: number | null = null;

function supported(target: EventTarget | null): target is Editor {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  if (target.disabled || target.readOnly || target.dataset.socialTokens === 'false') return false;
  if (target.dataset.socialTokens === 'true' || target instanceof HTMLTextAreaElement) return true;
  if (!['text', 'search'].includes((target.type || 'text').toLowerCase())) return false;
  const hint = `${target.name} ${target.id} ${target.placeholder} ${target.getAttribute('aria-label') || ''}`.toLowerCase();
  return /(comment|reply|message|caption|description|post|share|write|chat|bio|text)/.test(hint);
}

function activeToken(target: Editor): ActiveToken | null {
  const caret = target.selectionStart;
  if (caret == null) return null;
  const before = target.value.slice(0, caret);
  const mention = before.match(/(^|[^A-Za-z0-9_.-])@([A-Za-z0-9_.-]{0,64})$/);
  if (mention) return { kind: 'mention', query: mention[2], start: caret - mention[2].length - 1, end: caret };
  const hashtag = before.match(/(^|[^A-Za-z0-9_])#([A-Za-z0-9_]{0,64})$/);
  if (hashtag) return { kind: 'hashtag', query: hashtag[2], start: caret - hashtag[2].length - 1, end: caret };
  return null;
}

function root(): HTMLDivElement {
  let node = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (node) return node;
  node = document.createElement('div');
  node.id = ROOT_ID;
  node.setAttribute('role', 'listbox');
  Object.assign(node.style, {
    position: 'fixed', zIndex: '2147483000', display: 'none', minWidth: '220px', maxWidth: '380px', maxHeight: '320px',
    overflowY: 'auto', padding: '6px', border: '1px solid rgba(255,255,255,.12)', borderRadius: '14px',
    background: 'rgba(13,16,23,.98)', boxShadow: '0 18px 55px rgba(0,0,0,.45)', backdropFilter: 'blur(18px)',
    color: '#fff', fontFamily: 'inherit',
  });
  document.body.appendChild(node);
  return node;
}

function close() {
  const node = document.getElementById(ROOT_ID);
  if (node) node.style.display = 'none';
  token = null;
  items = [];
  selected = 0;
}

function compact(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, Number(value) || 0));
}

function position(node: HTMLDivElement) {
  if (!editor) return;
  const rect = editor.getBoundingClientRect();
  const width = Math.max(220, Math.min(380, rect.width || 320));
  const height = Math.min(320, 16 + Math.max(1, items.length) * 58);
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
  const top = window.innerHeight - rect.bottom > Math.min(180, height) ? rect.bottom + 6 : Math.max(8, rect.top - height - 6);
  node.style.width = `${width}px`;
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
}

function line(primary: string, secondary: string, index: number, icon: HTMLElement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'option');
  Object.assign(button.style, {
    display: 'flex', width: '100%', alignItems: 'center', gap: '10px', padding: '9px 10px', border: '0', borderRadius: '10px',
    background: index === selected ? 'rgba(67,83,255,.24)' : 'transparent', color: '#fff', cursor: 'pointer', textAlign: 'left',
  });
  const copy = document.createElement('span');
  copy.style.minWidth = '0';
  copy.style.flex = '1';
  const main = document.createElement('span');
  main.textContent = primary;
  Object.assign(main.style, { display: 'block', fontSize: '13px', fontWeight: '800', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  const sub = document.createElement('span');
  sub.textContent = secondary;
  Object.assign(sub.style, { display: 'block', marginTop: '2px', color: '#9ca3af', fontSize: '12px' });
  copy.append(main, sub);
  button.append(icon, copy);
  button.addEventListener('pointerenter', () => { selected = index; render(); });
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); choose(items[index]); });
  return button;
}

function mentionIcon(item: MentionItem) {
  if (item.avatarUrl) {
    const image = document.createElement('img');
    image.src = item.avatarUrl;
    image.alt = '';
    Object.assign(image.style, { width: '34px', height: '34px', borderRadius: '999px', objectFit: 'cover', flex: '0 0 auto' });
    return image;
  }
  const node = document.createElement('span');
  node.textContent = (item.fullName || item.username || 'D').slice(0, 1).toUpperCase();
  Object.assign(node.style, { width: '34px', height: '34px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.1)', fontSize: '12px', fontWeight: '800', flex: '0 0 auto' });
  return node;
}

function hashtagIcon(isNew?: boolean) {
  const node = document.createElement('span');
  node.textContent = '#';
  Object.assign(node.style, { width: '34px', height: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: isNew ? 'rgba(67,83,255,.22)' : 'rgba(255,255,255,.08)', color: isNew ? '#aeb6ff' : '#fff', fontSize: '18px', fontWeight: '900', flex: '0 0 auto' });
  return node;
}

function render() {
  if (!editor || !token) return close();
  const node = root();
  node.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.textContent = token.kind === 'mention' ? 'No matching users' : 'No hashtags found';
    Object.assign(empty.style, { padding: '11px 12px', fontSize: '13px', color: '#9ca3af' });
    node.appendChild(empty);
  } else {
    items.forEach((item, index) => {
      if (item.kind === 'mention') {
        node.appendChild(line(`${item.fullName || item.username}${item.verified ? ' ✓' : ''}`, `@${item.username}`, index, mentionIcon(item)));
      } else {
        const secondary = item.isNew ? 'Counted only after the post is published' : `${compact(item.usageCount)} ${item.usageCount === 1 ? 'use' : 'uses'}`;
        node.appendChild(line(item.isNew ? `Use #${item.tag}` : `#${item.tag}`, secondary, index, hashtagIcon(item.isNew)));
      }
    });
  }
  position(node);
  node.style.display = 'block';
}

function setValue(target: Editor, value: string) {
  const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(target, value); else target.value = value;
  target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

function choose(item: Suggestion | undefined) {
  if (!item || !editor || !token) return;
  const target = editor;
  const current = token;
  const replacement = item.kind === 'mention' ? `@${item.username}` : `#${item.tag}`;
  const value = `${target.value.slice(0, current.start)}${replacement} ${target.value.slice(current.end)}`;
  const caret = current.start + replacement.length + 1;
  setValue(target, value);
  target.focus();
  window.requestAnimationFrame(() => target.setSelectionRange(caret, caret));
  close();
}

async function communityId(target: Editor) {
  const scoped = target.closest<HTMLElement>('[data-community-id]')?.dataset.communityId;
  if (scoped && UUID_RE.test(scoped)) return scoped;
  const params = new URLSearchParams(location.search);
  const query = params.get('community_id') || params.get('community');
  if (query && UUID_RE.test(query)) return query;
  const match = location.pathname.match(/\/communities\/([^/?#]+)/i);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  if (UUID_RE.test(slug)) return slug;
  if (['new', 'create', 'discover', 'mine', 'joined'].includes(slug.toLowerCase())) return null;
  if (communityCache.has(slug)) return communityCache.get(slug) ?? null;
  const { data, error } = await supabase.rpc('get_community_by_slug', { p_slug: slug });
  const value = !error && data && typeof data === 'object' && 'id' in data ? String((data as { id?: unknown }).id || '') : '';
  const result = UUID_RE.test(value) ? value : null;
  communityCache.set(slug, result);
  return result;
}

async function context(target: Editor) {
  const scoped = target.closest<HTMLElement>('[data-conversation-id]')?.dataset.conversationId;
  const params = new URLSearchParams(location.search);
  const query = params.get('conv') || params.get('conversation') || params.get('conversation_id');
  const conversationId = scoped && UUID_RE.test(scoped) ? scoped : query && UUID_RE.test(query) ? query : null;
  return { conversationId, communityId: conversationId ? null : await communityId(target) };
}

async function load(target: Editor, current: ActiveToken, sequence: number) {
  if (current.kind === 'hashtag') {
    const { data, error } = await supabase.rpc('search_hashtags', { p_query: current.query, p_limit: 10 });
    if (sequence !== requestId || editor !== target) return;
    if (error) { items = []; return render(); }
    const rows = Array.isArray(data) ? data : [];
    const mapped = rows.map((row: Record<string, unknown>): HashtagItem => ({ kind: 'hashtag', tag: String(row.tag || ''), usageCount: Number(row.usage_count || 0) })).filter((item) => item.tag);
    const normalized = current.query.toLowerCase();
    if (normalized && /^[A-Za-z0-9_]{1,64}$/.test(normalized) && !mapped.some((item) => item.tag.toLowerCase() === normalized)) mapped.push({ kind: 'hashtag', tag: normalized, usageCount: 0, isNew: true });
    items = mapped;
    selected = 0;
    return render();
  }

  const scope = await context(target);
  if (sequence !== requestId || editor !== target) return;
  const { data, error } = await supabase.rpc('search_social_mentions', { p_query: current.query, p_community_id: scope.communityId, p_conversation_id: scope.conversationId, p_limit: 10 });
  if (sequence !== requestId || editor !== target) return;
  if (error) { items = []; return render(); }
  const rows = Array.isArray(data) ? data : [];
  items = rows.map((row: Record<string, unknown>): MentionItem => ({
    kind: 'mention', userId: String(row.user_id || ''), username: String(row.username || ''),
    fullName: row.full_name == null ? null : String(row.full_name), avatarUrl: row.avatar_url == null ? null : String(row.avatar_url), verified: Boolean(row.is_verified),
  })).filter((item) => item.userId && item.username);
  selected = 0;
  render();
}

function schedule(target: Editor) {
  editor = target;
  token = activeToken(target);
  if (timer != null) clearTimeout(timer);
  if (!token) return close();
  const current = token;
  const sequence = ++requestId;
  timer = window.setTimeout(() => void load(target, current, sequence), 130);
}

if (typeof document !== 'undefined') {
  document.addEventListener('input', (event) => { if (supported(event.target)) schedule(event.target); }, true);
  document.addEventListener('click', (event) => { if (supported(event.target) && editor === event.target) schedule(event.target); }, true);
  document.addEventListener('keyup', (event) => { if (supported(event.target) && editor === event.target) schedule(event.target); }, true);
  document.addEventListener('keydown', (event) => {
    if (!supported(event.target) || editor !== event.target || !token || !items.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); selected = (selected + 1) % items.length; render(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); selected = (selected - 1 + items.length) % items.length; render(); }
    else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(items[selected]); }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
  }, true);
  document.addEventListener('pointerdown', (event) => {
    const node = document.getElementById(ROOT_ID);
    if (node?.contains(event.target as Node) || event.target === editor) return;
    close();
  }, true);
  const reposition = () => { const node = document.getElementById(ROOT_ID) as HTMLDivElement | null; if (node && node.style.display !== 'none') position(node); };
  window.addEventListener('resize', reposition, { passive: true });
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('popstate', close);
}
