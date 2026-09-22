/**
 * The search term to send, or null when there is nothing to search for.
 *
 * One character is a valid search — "A" legitimately narrows the catalogue —
 * but an empty or whitespace-only query must never reach the API, where it
 * would mean "no filter" and return the whole catalogue.
 */
export function searchTerm(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  return value.length > 0 ? value : null;
}
