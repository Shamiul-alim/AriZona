import { createHash } from 'node:crypto';

/**
 * Helpers for talking about a secret without disclosing it.
 *
 * These exist because a diagnostics endpoint or a log line is often the only way
 * to answer "is the new key actually live?", and the obvious way to answer it —
 * printing the value — is what turns an operational question into an incident.
 */

/** What a redacted value looks like everywhere. */
export const REDACTED = '[REDACTED]';

/**
 * A short, stable fingerprint of a secret: enough to tell two values apart,
 * useless for authenticating with either.
 *
 * After rotating an SMTP key or an OAuth secret, comparing this before and after
 * proves the running process picked up the new value. It is a truncated SHA-256,
 * so it cannot be reversed, and the length is included because a wrong-length
 * value is the usual sign of a truncated copy-paste.
 */
export function secretFingerprint(value: string | undefined | null): string {
  if (!value) return 'unset';
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 8);
  return `len=${value.length} sha256=${digest}`;
}

/** `someone@example.com` -> `som***@example.com`. Identifies without exposing. */
export function maskEmail(value: string | undefined | null): string | null {
  if (!value) return null;
  const at = value.lastIndexOf('@');
  if (at <= 0) return `${value.slice(0, 2)}***`;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = local.length <= 3 ? local.slice(0, 1) : local.slice(0, 3);
  return `${head}***@${domain}`;
}

/** Header names that must never be logged with their value. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
]);

/**
 * A copy of a header bag safe to log: sensitive values are replaced rather than
 * dropped, so it is still obvious that the header was present.
 */
export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    safe[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }
  return safe;
}

/** Keys whose values are secrets wherever they appear in a nested object. */
const SENSITIVE_KEYS =
  /(password|passwd|secret|token|apikey|api_key|authorization|cookie|private_key|credential|client_secret|refresh_token)/i;

/**
 * Deep copy of an object with every secret-looking value replaced. Use it before
 * logging anything whose shape you do not fully control — a config dump, a
 * webhook body, an error payload from a third party.
 */
export function redactDeep<T>(input: T, depth = 0): unknown {
  if (depth > 8 || input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map((item) => redactDeep(item, depth + 1));
  if (typeof input !== 'object') return input;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(key)) {
      out[key] = value === undefined || value === null ? value : REDACTED;
    } else {
      out[key] = redactDeep(value, depth + 1);
    }
  }
  return out;
}
