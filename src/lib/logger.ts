// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Monitoring & Logging
// Structured logging with severity levels, timestamps, and error tracking.
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

const logBuffer: LogEntry[] = [];
const MAX_BUFFER = 100;

function formatLog(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}`;
}

function log(level: LogLevel, category: string, message: string, data?: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    data: data instanceof Error ? { name: data.name, message: data.message, stack: data.stack } : data,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER) logBuffer.shift();

  if (level === 'error' || level === 'fatal') {
    console.error(formatLog(entry), entry.data || '');
  } else if (level === 'warn') {
    console.warn(formatLog(entry), entry.data || '');
  } else if (import.meta.env.DEV) {
    console.log(formatLog(entry), entry.data || '');
  }
}

export const logger = {
  debug: (category: string, message: string, data?: unknown) => log('debug', category, message, data),
  info: (category: string, message: string, data?: unknown) => log('info', category, message, data),
  warn: (category: string, message: string, data?: unknown) => log('warn', category, message, data),
  error: (category: string, message: string, data?: unknown) => log('error', category, message, data),
  fatal: (category: string, message: string, data?: unknown) => log('fatal', category, message, data),
  getRecentLogs: (): LogEntry[] => [...logBuffer],
  clear: () => { logBuffer.length = 0; },
};

// ─── Error Tracking Categories ───────────────────────────────────────────────

export const ErrorCategory = {
  API: 'api',
  DATABASE: 'database',
  AUTH: 'auth',
  PAYMENT: 'payment',
  AI: 'ai',
  NOTIFICATION: 'notification',
  UPLOAD: 'upload',
  REALTIME: 'realtime',
  UI: 'ui',
} as const;
