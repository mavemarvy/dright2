const REDIRECT_KEY = 'dright_redirect_after_login';
const LEGACY_REDIRECT_KEY = 'pending_redirect';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

interface RedirectPayload {
  path: string;
  savedAt: number;
  expiresAt: number;
}

function isSafeInternalPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(path)) return false;
  if (path.includes('\\')) return false;

  try {
    const parsed = new URL(path, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/');
  } catch {
    return false;
  }
}

function normalizeInternalPath(path: string): string | null {
  if (!isSafeInternalPath(path)) return null;
  try {
    const parsed = new URL(path, window.location.origin);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function readRawStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorage(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore unavailable session storage.
  }
}

function writePayload(payload: RedirectPayload): void {
  try {
    sessionStorage.setItem(REDIRECT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore unavailable session storage.
  }
}

function parsePayload(raw: string): RedirectPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RedirectPayload>;
    if (
      typeof parsed.path === 'string' &&
      typeof parsed.savedAt === 'number' &&
      typeof parsed.expiresAt === 'number'
    ) {
      const safePath = normalizeInternalPath(parsed.path);
      if (!safePath) return null;
      return { path: safePath, savedAt: parsed.savedAt, expiresAt: parsed.expiresAt };
    }
  } catch {
    // Backward compatibility: the historical value was a raw path string.
    const safePath = normalizeInternalPath(raw);
    if (safePath) {
      const now = Date.now();
      return { path: safePath, savedAt: now, expiresAt: now + DEFAULT_TTL_MS };
    }
  }
  return null;
}

function migrateLegacyRedirect(): RedirectPayload | null {
  const legacyRaw = readRawStorage(LEGACY_REDIRECT_KEY);
  if (!legacyRaw) return null;

  removeStorage(LEGACY_REDIRECT_KEY);
  const safePath = normalizeInternalPath(legacyRaw);
  if (!safePath) return null;

  const now = Date.now();
  const payload: RedirectPayload = {
    path: safePath,
    savedAt: now,
    expiresAt: now + DEFAULT_TTL_MS,
  };
  writePayload(payload);
  return payload;
}

export function saveRedirectPath(path: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const safePath = normalizeInternalPath(path);
  if (!safePath) return false;

  const now = Date.now();
  writePayload({
    path: safePath,
    savedAt: now,
    expiresAt: now + Math.max(60_000, ttlMs),
  });
  removeStorage(LEGACY_REDIRECT_KEY);
  return true;
}

export function peekRedirectPath(): string | null {
  let payload: RedirectPayload | null = null;
  const raw = readRawStorage(REDIRECT_KEY);

  if (raw) {
    payload = parsePayload(raw);
    if (payload) {
      // Upgrade historical raw-string values to the canonical payload format.
      writePayload(payload);
    }
  } else {
    payload = migrateLegacyRedirect();
  }

  if (!payload) {
    clearRedirectPath();
    return null;
  }

  if (payload.expiresAt <= Date.now()) {
    clearRedirectPath();
    return null;
  }

  return payload.path;
}

export function consumeRedirectPath(fallback = '/'): string {
  const path = peekRedirectPath();
  clearRedirectPath();
  return path || fallback;
}

export function clearRedirectPath(): void {
  removeStorage(REDIRECT_KEY);
  removeStorage(LEGACY_REDIRECT_KEY);
}

export function getRedirectStorageKey(): string {
  return REDIRECT_KEY;
}
