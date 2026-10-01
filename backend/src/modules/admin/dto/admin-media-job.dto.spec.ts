import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterMediaDto } from './admin-media-job.dto';

/**
 * These caps are there to bound a malformed request, not to describe real
 * content. A real Solo Leveling episode carrying 13 text subtitle streams was
 * rejected by a cap of 12 after the worker had already downloaded the file and
 * converted every track, so the limits are worth pinning to something a real
 * release cannot trip.
 */
describe('RegisterMediaDto track limits', () => {
  const subtitle = (i: number) => ({
    language: `l${i}`,
    label: `Label ${i}`,
    format: 'VTT',
    driveFileId: `file-${i}`,
  });
  const audio = (i: number) => ({
    language: `a${i}`,
    label: `Audio ${i}`,
    driveFileId: `audio-${i}`,
  });

  const errorsFor = async (body: Record<string, unknown>) =>
    validate(plainToInstance(RegisterMediaDto, { variants: [], ...body }), {
      // Only the array sizes are under test here; the nested shapes have their
      // own rules and a partial fixture should not fail on them.
      skipMissingProperties: true,
    });

  const sizeErrors = (errors: Awaited<ReturnType<typeof errorsFor>>, field: string) =>
    errors
      .filter((e) => e.property === field)
      .flatMap((e) => Object.values(e.constraints ?? {}))
      .filter((m) => /no more than/.test(m));

  it('accepts the 13 subtitle streams a real release carried', async () => {
    const errors = await errorsFor({
      subtitleTracks: Array.from({ length: 13 }, (_, i) => subtitle(i)),
    });
    expect(sizeErrors(errors, 'subtitleTracks')).toEqual([]);
  });

  it('accepts a heavily subtitled release', async () => {
    const errors = await errorsFor({
      subtitleTracks: Array.from({ length: 48 }, (_, i) => subtitle(i)),
    });
    expect(sizeErrors(errors, 'subtitleTracks')).toEqual([]);
  });

  it('still refuses an absurd number of subtitles', async () => {
    const errors = await errorsFor({
      subtitleTracks: Array.from({ length: 49 }, (_, i) => subtitle(i)),
    });
    expect(sizeErrors(errors, 'subtitleTracks')).not.toEqual([]);
  });

  it('accepts a multi-dub release and refuses an absurd one', async () => {
    expect(sizeErrors(await errorsFor({ audioTracks: Array.from({ length: 24 }, (_, i) => audio(i)) }), 'audioTracks')).toEqual([]);
    expect(sizeErrors(await errorsFor({ audioTracks: Array.from({ length: 25 }, (_, i) => audio(i)) }), 'audioTracks')).not.toEqual([]);
  });
});
