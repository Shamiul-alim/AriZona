import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
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
