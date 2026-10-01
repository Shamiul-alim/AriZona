import { describe, expect, it } from 'vitest';
import { autoTracksForMode, mediaModeFromSource } from './media-mode';

describe('mediaModeFromSource', () => {
  it('loads a source with a stored master as the legacy mode', () => {
    expect(mediaModeFromSource({ masterDriveFileId: 'abc', autoTracks: true })).toBe('SINGLE_MASTER');
  });

  it('loads a manual source with auto tracks on as AUTO_TRACKS', () => {
    expect(mediaModeFromSource({ autoTracks: true })).toBe('AUTO_TRACKS');
  });

  it('loads a manual source with auto tracks off as FULL_MANUAL', () => {
    expect(mediaModeFromSource({ autoTracks: false })).toBe('FULL_MANUAL');
  });

  it('loads an episode saved before auto tracks existed as FULL_MANUAL', () => {
    // The field is absent on those rows; they must not start queueing jobs.
    expect(mediaModeFromSource({})).toBe('FULL_MANUAL');
  });
});

describe('autoTracksForMode', () => {
  it('asks for detection in AUTO_TRACKS', () => {
    expect(autoTracksForMode('AUTO_TRACKS')).toBe(true);
  });

  it('sends an explicit false for FULL_MANUAL so switching back clears the flag', () => {
    // undefined would leave a previously stored true in place, and the worker
    // would keep picking the episode up after the admin turned detection off.
    expect(autoTracksForMode('FULL_MANUAL')).toBe(false);
    expect(autoTracksForMode('FULL_MANUAL')).not.toBeUndefined();
  });

  it('leaves the flag alone for a legacy master source', () => {
    expect(autoTracksForMode('SINGLE_MASTER')).toBeUndefined();
  });

  it('round-trips a full-manual source without turning detection on', () => {
    const stored = { autoTracks: autoTracksForMode('FULL_MANUAL') };
    expect(mediaModeFromSource(stored)).toBe('FULL_MANUAL');
  });
});
