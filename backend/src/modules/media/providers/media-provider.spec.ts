import { parseRange } from './media-provider.interface';
import { GoogleDriveProvider } from './google-drive.provider';

/**
 * Range parsing is the single most correctness-critical function in the media
 * layer: get it wrong and seeking silently returns the wrong bytes, which looks
 * like a corrupt video rather than a bug.
 */
describe('parseRange', () => {
  const SIZE = 1000;

  it('returns null when no Range header is present', () => {
    expect(parseRange(undefined, SIZE)).toBeNull();
  });

  it('returns null for a malformed header rather than throwing', () => {
    expect(parseRange('bytes=abc', SIZE)).toBeNull();
    expect(parseRange('items=0-10', SIZE)).toBeNull();
  });

  it('parses a fully specified range', () => {
    expect(parseRange('bytes=0-499', SIZE)).toEqual({ start: 0, end: 499 });
    expect(parseRange('bytes=200-399', SIZE)).toEqual({ start: 200, end: 399 });
  });

  it('treats an open-ended range as running to the last byte', () => {
    expect(parseRange('bytes=500-', SIZE)).toEqual({ start: 500, end: 999 });
  });

  it('handles the suffix form as the final N bytes', () => {
    expect(parseRange('bytes=-200', SIZE)).toEqual({ start: 800, end: 999 });
  });

  it('clamps an end beyond the file to the last byte', () => {
    expect(parseRange('bytes=900-5000', SIZE)).toEqual({ start: 900, end: 999 });
  });

  it('clamps a suffix larger than the file to the whole file', () => {
    expect(parseRange('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 });
  });

  it('throws for a start beyond the end of the file', () => {
    expect(() => parseRange('bytes=1000-1100', SIZE)).toThrow(RangeError);
    expect(() => parseRange('bytes=2000-', SIZE)).toThrow(RangeError);
  });

  it('throws when start is after end', () => {
    expect(() => parseRange('bytes=500-200', SIZE)).toThrow(RangeError);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseRange('  bytes=0-99  ', SIZE)).toEqual({ start: 0, end: 99 });
  });
});

/**
 * Admins paste whatever Drive gave them. Every shape below is something a real
 * Drive UI produces, so all of them have to resolve to the same file ID.
 */
describe('GoogleDriveProvider.extractFileId', () => {
  const ID = '1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv';

  it('accepts a bare file ID', () => {
    expect(GoogleDriveProvider.extractFileId(ID)).toBe(ID);
  });

  it('extracts from a /file/d/ share link', () => {
    expect(GoogleDriveProvider.extractFileId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
  });

  it('extracts from an open?id= link', () => {
    expect(GoogleDriveProvider.extractFileId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it('extracts from a uc?id= link', () => {
    expect(GoogleDriveProvider.extractFileId(`https://drive.google.com/uc?id=${ID}&export=download`)).toBe(ID);
  });

  it('trims surrounding whitespace', () => {
    expect(GoogleDriveProvider.extractFileId(`  ${ID}  `)).toBe(ID);
  });

  it('returns null for something that is not a Drive reference', () => {
    expect(GoogleDriveProvider.extractFileId('')).toBeNull();
    expect(GoogleDriveProvider.extractFileId('not a link')).toBeNull();
    expect(GoogleDriveProvider.extractFileId('https://example.com/video.mp4')).toBeNull();
  });
});
