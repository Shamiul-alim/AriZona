import slugify from 'slugify';

export function toSlug(input: string): string {
  return slugify(input, { lower: true, strict: true, trim: true, locale: 'en' }) || 'untitled';
}

/**
 * Appends -2, -3, … until the slug is free. `exists` is supplied by the caller
 * so this stays storage-agnostic and easy to unit test.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  const root = toSlug(base);
  if (!(await exists(root))) return root;

  for (let i = 2; i <= maxAttempts; i += 1) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
