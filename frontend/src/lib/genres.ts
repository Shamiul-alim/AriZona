import { apiFetch } from './api';
import type { GenreRef } from './types';

/**
 * The genre list, fetched once per browser.
 *
 * Two long-lived components want it — the header's Genres menu and the browse
 * filter panel — and on /browse both mount at once and each asked the API for
 * the same list, which changes only when an administrator edits the taxonomy.
 * Sharing the in-flight promise means concurrent callers join one request and
 * anything mounting later gets the array that already arrived.
 */
let inFlight: Promise<GenreRef[]> | null = null;

export function loadGenres(): Promise<GenreRef[]> {
  inFlight ??= apiFetch<GenreRef[]>('/genres').catch((error) => {
    // A failed load must not be remembered, or one bad response would leave the
    // menu empty for the rest of the session.
    inFlight = null;
    throw error;
  });
  return inFlight;
}

/** Drops the cached list. Exists for tests. */
export function resetGenreCache(): void {
  inFlight = null;
}
