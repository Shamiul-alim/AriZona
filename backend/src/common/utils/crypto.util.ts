import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * A numeric one-time code, zero-padded to `digits`.
 *
 * `randomInt` draws from the CSPRNG and rejects biased samples, unlike
 * `Math.random()` — a reset code is a credential and must not be predictable
 * from timing or previous codes.
 */
export function randomDigits(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, '0');
}

export function hmacSign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Constant-time comparison — avoids leaking signature bytes through timing. */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Stable pseudonymous fingerprint for view de-duplication and rate limiting.
 * Deliberately one-way: raw IP addresses are never persisted.
 */
export function visitorFingerprint(ip: string | undefined, userAgent: string | undefined, salt: string): string {
  return sha256(`${ip ?? 'unknown'}|${userAgent ?? 'unknown'}|${salt}`);
}
