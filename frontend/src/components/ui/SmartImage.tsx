import NextImage, { type ImageProps } from 'next/image';
import { isOptimizableSrc } from '@/lib/images';

/**
 * `next/image` with one addition: artwork hosted somewhere we have not
 * allow-listed is rendered unoptimized, so the browser loads it straight from
 * that host.
 *
 * Without this, an administrator who pastes an image URL from an external host
 * gets a broken image, because the optimizer refuses any host missing from
 * `remotePatterns` — and widening that list to `**` would let anyone use our
 * optimizer as a proxy for arbitrary URLs.
 *
 * Our own uploads (`/uploads/...`) are unaffected and still optimized.
 */
export function SmartImage({ src, unoptimized, ...rest }: ImageProps) {
  const needsDirectLoad = typeof src === 'string' && !isOptimizableSrc(src);
  return <NextImage src={src} unoptimized={unoptimized ?? needsDirectLoad} {...rest} />;
}

export default SmartImage;
