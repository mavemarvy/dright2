// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Safety — Prompt validation, input sanitization, abuse detection
//
// All safety checks run client-side before sending to edge functions.
// The edge functions run their own server-side validation as well.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PROMPT_LENGTH = 8000;
const BANNED_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|above)\s+/gi,
  /you\s+are\s+now\s+(a|an)\s+/gi,
  /system\s*:\s*/gi,
  /<\/?system>/gi,
  /reveal\s+(your|the)\s+(system\s+)?prompt/gi,
  /show\s+me\s+(your|the)\s+(system\s+)?prompt/gi,
  /what\s+are\s+your\s+instructions/gi,
];

const SENSITIVE_DATA_PATTERNS = [
  /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, // Credit card numbers
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
  /\bsk-[A-Za-z0-9]{20,}\b/g, // API keys
  /\bgsk_[A-Za-z0-9]{20,}\b/g, // Groq keys
  /\bAIza[A-Za-z0-9]{20,}\b/g, // Gemini keys
];

export interface SafetyCheckResult {
  safe: boolean;
  sanitizedPrompt: string;
  violations: string[];
  blocked: boolean;
}

export function validatePrompt(input: string): SafetyCheckResult {
  const violations: string[] = [];
  let sanitized = input;

  // Length check
  if (input.length > MAX_PROMPT_LENGTH) {
    sanitized = input.slice(0, MAX_PROMPT_LENGTH);
    violations.push('prompt_truncated');
  }

  // Remove null bytes and control characters
  sanitized = sanitized
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();

  // Check for prompt injection attempts
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(sanitized)) {
      violations.push('prompt_injection_attempt');
      sanitized = sanitized.replace(pattern, '');
      break; // Only report once
    }
  }

  // Check for sensitive data
  for (const pattern of SENSITIVE_DATA_PATTERNS) {
    if (pattern.test(sanitized)) {
      violations.push('sensitive_data_detected');
      sanitized = sanitized.replace(pattern, '[REDACTED]');
      break;
    }
  }

  // Block if too many violations
  const blocked = violations.length >= 2 || violations.includes('prompt_injection_attempt');

  return {
    safe: violations.length === 0,
    sanitizedPrompt: sanitized,
    violations,
    blocked,
  };
}

export function sanitizeForAI(input: string): string {
  return validatePrompt(input).sanitizedPrompt;
}

export function containsSensitiveData(input: string): boolean {
  return SENSITIVE_DATA_PATTERNS.some(p => p.test(input));
}

export function logAbuseAttempt(params: {
  userId?: string;
  feature: string;
  prompt: string;
  violationType: string;
  severity?: 'low' | 'medium' | 'high';
  blocked: boolean;
}): void {
  // Fire-and-forget — don't block the UI
  import('../supabase').then(({ supabase }) => {
    supabase.from('ai_abuse_log').insert({
      user_id: params.userId || null,
      feature: params.feature,
      prompt: params.prompt.slice(0, 2000),
      violation_type: params.violationType,
      severity: params.severity || 'medium',
      blocked: params.blocked,
    }).then(() => {}, (err) => {
      console.error('Failed to log abuse attempt:', err);
    });
  });
}
