/**
 * The two media workflows an admin picks between, plus the retired one.
 *
 * FULL_MANUAL and AUTO_TRACKS differ only in whether the worker is allowed to
 * read one of the supplied files; both store the admin's own qualities and
 * neither lets anything re-encode them. They are separate modes rather than a
 * checkbox because that choice decides whether a job is queued at all, which
 * is too consequential to read as a tickbox nested inside another mode.
 *
 * SINGLE_MASTER is the retired transcoding workflow. It stays a valid value so
 * existing rows keep working and stay editable, but it is offered in the picker
 * only when the source being edited is already one.
 *
 * This lives apart from the episode form because the mapping in both directions
 * decides whether a worker job is queued, which is worth testing on its own
 * rather than through a form render.
 */
export type MediaMode = 'FULL_MANUAL' | 'AUTO_TRACKS' | 'SINGLE_MASTER';

/** What a stored media source should load as in the form. */
export function mediaModeFromSource(source: {
  masterDriveFileId?: unknown;
  autoTracks?: unknown;
}): MediaMode {
  // A stored master means the worker built this source the old way.
  if (source.masterDriveFileId) return 'SINGLE_MASTER';
  // Otherwise the stored flag is the only thing separating the two manual
  // modes. It is false for everything saved before auto tracks existed, so
  // those load as Full manual and no worker ever touches them.
  return source.autoTracks ? 'AUTO_TRACKS' : 'FULL_MANUAL';
}

/**
 * What to send as `autoTracks` when saving.
 *
 * Full manual sends an explicit false rather than undefined: switching a
 * source back from auto tracks has to clear the stored flag, and omitting the
 * field would leave a stored true in place and keep queueing jobs for an
 * episode the admin has just said to leave alone.
 */
export function autoTracksForMode(mode: MediaMode): boolean | undefined {
  if (mode === 'SINGLE_MASTER') return undefined;
  return mode === 'AUTO_TRACKS';
}
