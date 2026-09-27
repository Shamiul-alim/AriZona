/**
 * The episode number a viewer should see inside a season.
 *
 * Episode.number is canonical and unique per anime, because the watch URL is
 * /watch/:slug/ep-:number and two "episode 1"s under one title would make that
 * URL ambiguous. So DATE A LIVE stores season 2 as episodes 4, 5 and 6 — right
 * for the database, wrong for a viewer who picked "Season 2" and expects to
 * start at episode 1.
 *
 * The display ordinal is therefore derived from position within the season
 * rather than stored. Deriving it needs no migration, cannot drift out of sync
 * with the episodes it describes, and keeps one source of truth for identity:
 * the canonical number. An episode with no season keeps its canonical number,
 * which is what a title without seasons should show.
 */

/** An episode as far as ordinal assignment is concerned. */
export interface OrdinalInput {
  number: number;
  seasonId: string | null;
}

/**
 * Maps each episode to its 1-based position within its own season, in
 * canonical order. Episodes without a season are left alone.
 *
 * The whole season must be present in `episodes` for the result to be right,
 * so callers pass the full list for the anime, not a page of it.
 */
export function seasonOrdinals<T extends OrdinalInput>(episodes: T[]): Map<T, number> {
  const bySeason = new Map<string, T[]>();
  for (const episode of episodes) {
    if (!episode.seasonId) continue;
    const bucket = bySeason.get(episode.seasonId);
    if (bucket) bucket.push(episode);
    else bySeason.set(episode.seasonId, [episode]);
  }

  const ordinals = new Map<T, number>();
  for (const bucket of bySeason.values()) {
    bucket.sort((a, b) => a.number - b.number);
    bucket.forEach((episode, index) => ordinals.set(episode, index + 1));
  }
  return ordinals;
}

/**
 * `seasonEpisodeNumber` is what the UI labels an episode inside its season, and
 * equals `number` when the episode belongs to no season. It is presentation
 * only — nothing is ever looked up by it.
 */
export function withSeasonOrdinals<T extends OrdinalInput>(episodes: T[]): (T & { seasonEpisodeNumber: number })[] {
  const ordinals = seasonOrdinals(episodes);
  return episodes.map((episode) => ({
    ...episode,
    seasonEpisodeNumber: ordinals.get(episode) ?? episode.number,
  }));
}
