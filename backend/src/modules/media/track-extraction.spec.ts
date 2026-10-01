import {
  audioExtractionArgs,
  audioNeedsConversion,
  pickTrackSource,
  qualityLabel,
  subtitleExtractionArgs,
  VIDEO_ENCODING_FLAGS,
  distinguish,
  alreadyBuilt,
} from './probe';

const variant = (quality: string, driveFileId: string | null = 'file-' + quality, isActive = true) => ({
  quality,
  driveFileId,
  isActive,
});

describe('pickTrackSource', () => {
  it('reads tracks from the highest quality available', () => {
    const picked = pickTrackSource([variant('Q_480P'), variant('Q_1080P'), variant('Q_720P')]);
    expect(picked?.quality).toBe('Q_1080P');
  });

  it('falls to the next quality down when the best one is missing', () => {
    // An episode whose 1080p was never uploaded should still get its tracks.
    expect(pickTrackSource([variant('Q_480P'), variant('Q_720P')])?.quality).toBe('Q_720P');
    expect(pickTrackSource([variant('Q_360P')])?.quality).toBe('Q_360P');
  });

  it('honours an explicit choice over the automatic one', () => {
    // Two qualities of one episode do not always carry the same streams, and
    // the operator may know which file is the complete one.
    const picked = pickTrackSource([variant('Q_1080P'), variant('Q_720P')], 'Q_720P');
    expect(picked?.quality).toBe('Q_720P');
  });

  it('falls back to automatic when the chosen quality is not there', () => {
    const picked = pickTrackSource([variant('Q_720P'), variant('Q_480P')], 'Q_1080P');
    expect(picked?.quality).toBe('Q_720P');
  });

  it('treats AUTO as no preference', () => {
    expect(pickTrackSource([variant('Q_1080P'), variant('Q_720P')], 'AUTO')?.quality).toBe('Q_1080P');
  });

  it('ignores qualities with no file and inactive ones', () => {
    const picked = pickTrackSource([variant('Q_1080P', null), variant('Q_720P', 'f', false), variant('Q_480P')]);
    expect(picked?.quality).toBe('Q_480P');
  });

  it('returns null when there is nothing to read', () => {
    expect(pickTrackSource([])).toBeNull();
    expect(pickTrackSource([variant('Q_1080P', null)])).toBeNull();
  });

  it('picks exactly one source, never several', () => {
    // Probing every quality would cost four downloads to learn the same thing.
    const picked = pickTrackSource([variant('Q_1080P'), variant('Q_720P'), variant('Q_480P'), variant('Q_360P')]);
    expect(picked).not.toBeNull();
    expect(picked?.quality).toBe('Q_1080P');
  });
});

describe('qualityLabel', () => {
  it('reads as an admin would write it', () => {
    expect(qualityLabel('Q_1080P')).toBe('1080p');
    expect(qualityLabel('Q_360P')).toBe('360p');
  });

  it('passes anything unexpected through untouched', () => {
    expect(qualityLabel('AUTO')).toBe('AUTO');
  });
});

describe('audioNeedsConversion', () => {
  it('copies AAC, which the player already plays', () => {
    expect(audioNeedsConversion('aac')).toBe(false);
    expect(audioNeedsConversion('AAC')).toBe(false);
  });

  it('converts anything else', () => {
    for (const codec of ['ac3', 'eac3', 'dts', 'flac', 'opus', 'truehd', 'mp3', 'pcm_s16le']) {
      expect(audioNeedsConversion(codec)).toBe(true);
    }
  });

  it('converts when the codec is unknown, rather than gambling on a copy', () => {
    expect(audioNeedsConversion(undefined)).toBe(true);
  });
});

describe('extraction never touches the video', () => {
  // The promise this workflow makes: the admin supplies the qualities and we
  // leave them alone. A flag that re-encodes video appearing here would break
  // that silently, so it is asserted rather than reviewed.

  it('audio extraction disables video and carries no encoder flag', () => {
    for (const copy of [true, false]) {
      const args = audioExtractionArgs('/tmp/source', 1, '/tmp/out.m4a', copy);
      expect(args).toContain('-vn');
      for (const flag of VIDEO_ENCODING_FLAGS) {
        expect(args).not.toContain(flag);
      }
    }
  });

  it('audio extraction copies an AAC stream and converts everything else', () => {
    expect(audioExtractionArgs('/s', 1, '/o', true)).toEqual(expect.arrayContaining(['-c:a', 'copy']));
    const converted = audioExtractionArgs('/s', 1, '/o', false);
    expect(converted).toEqual(expect.arrayContaining(['-c:a', 'aac']));
    expect(converted).not.toContain('copy');
  });

  it('subtitle extraction maps one stream and carries no encoder flag', () => {
    const args = subtitleExtractionArgs('/tmp/source', 3, '/tmp/out.vtt');
    expect(args).toEqual(expect.arrayContaining(['-map', '0:3', '-c:s', 'webvtt']));
    for (const flag of VIDEO_ENCODING_FLAGS) {
      expect(args).not.toContain(flag);
    }
  });

  it('passes paths as separate arguments, never interpolated into a string', () => {
    // A filename reaching a shell is how a quoting bug becomes a security bug.
    const hostile = "/tmp/ep'; rm -rf /; echo '.mkv";
    const args = audioExtractionArgs(hostile, 1, '/tmp/out.m4a', true);
    expect(args).toContain(hostile);
    expect(args.join(' ')).toContain(hostile);
    expect(args.filter((a) => a === hostile)).toHaveLength(1);
  });
});

describe('telling same-language streams apart', () => {
  it('leaves a single stream of a language on the bare slug', () => {
    const seen = new Map<string, number>();
    expect(distinguish('eng', 'English', seen)).toEqual({ slug: 'eng', label: 'English' });
  });

  it('numbers the second stream of a language instead of reusing the first', () => {
    // Solo Leveling S1E3 carries two English and two Spanish subtitle streams
    // with different content. Keyed on the language alone, the second found the
    // first one's uploaded file and served it twice.
    const seen = new Map<string, number>();
    expect(distinguish('eng', 'English', seen).slug).toBe('eng');
    expect(distinguish('eng', 'English', seen)).toEqual({ slug: 'eng-2', label: 'English 2' });
    expect(distinguish('spa', 'Spanish', seen).slug).toBe('spa');
    expect(distinguish('spa', 'Spanish', seen).slug).toBe('spa-2');
    expect(distinguish('eng', 'English', seen).slug).toBe('eng-3');
  });

  it('keeps distinct languages independent', () => {
    const seen = new Map<string, number>();
    expect(distinguish('hin', 'Hindi', seen).slug).toBe('hin');
    expect(distinguish('jpn', 'Japanese', seen).slug).toBe('jpn');
    expect(distinguish('hin', 'Hindi', seen).slug).toBe('hin-2');
  });
});

describe('alreadyBuilt', () => {
  it('keys existing uploads the same way they were named', () => {
    const built = alreadyBuilt([
      { language: 'eng', driveFileId: 'file-eng-1' },
      { language: 'ara', driveFileId: 'file-ara' },
      { language: 'eng', driveFileId: 'file-eng-2' },
    ]);
    // Each English stream must resolve to its own file, not the first one.
    expect(built.get('eng')).toBe('file-eng-1');
    expect(built.get('eng-2')).toBe('file-eng-2');
    expect(built.get('ara')).toBe('file-ara');
  });

  it('skips a track that has no file yet without shifting the others', () => {
    const built = alreadyBuilt([
      { language: 'eng', driveFileId: null },
      { language: 'eng', driveFileId: 'file-eng-2' },
    ]);
    expect(built.has('eng')).toBe(false);
    expect(built.get('eng-2')).toBe('file-eng-2');
  });
});
