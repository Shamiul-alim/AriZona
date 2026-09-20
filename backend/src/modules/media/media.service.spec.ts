import { ForbiddenException } from '@nestjs/common';
import { ensureVttHeader, srtToVtt, MediaService } from './media.service';
import { hmacSign } from 'src/common/utils/crypto.util';

describe('subtitle conversion', () => {
  it('leaves a well-formed WebVTT file alone', () => {
    const input = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello\n';
    expect(ensureVttHeader(input)).toBe(input.trimStart());
  });

  it('adds the WEBVTT header when it is missing', () => {
    const output = ensureVttHeader('00:00:01.000 --> 00:00:02.000\nHello');
    expect(output.startsWith('WEBVTT\n\n')).toBe(true);
  });

  it('strips a byte-order mark', () => {
    expect(ensureVttHeader('﻿WEBVTT\n\ncue').startsWith('WEBVTT')).toBe(true);
  });

  it('converts SRT timestamps and drops cue indices', () => {
    const srt = ['1', '00:00:01,500 --> 00:00:03,200', 'First line', '', '2', '00:00:04,000 --> 00:00:06,000', 'Second line', ''].join('\n');

    const vtt = srtToVtt(srt);

    expect(vtt.startsWith('WEBVTT')).toBe(true);
    // Commas become periods.
    expect(vtt).toContain('00:00:01.500 --> 00:00:03.200');
    expect(vtt).toContain('00:00:04.000 --> 00:00:06.000');
    expect(vtt).not.toContain(',500');
    // The numeric index lines are gone.
    expect(vtt).not.toMatch(/^\s*1\s*$/m);
    expect(vtt).toContain('First line');
    expect(vtt).toContain('Second line');
  });

  it('handles CRLF line endings', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nLine\r\n';
    const vtt = srtToVtt(srt);
    expect(vtt).not.toContain('\r');
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
  });
});

/**
 * Signed playback links keep Drive file IDs out of the browser and make
 * hot-linking impractical. Verification must reject anything but an intact,
 * unexpired signature.
 */
describe('MediaService signing', () => {
  const SECRET = 'test-signing-secret-at-least-16-chars';

  const config = {
    values: {
      media: { signingSecret: SECRET, signedUrlTtl: 3600, maxRangeChunk: 0 },
      publicUrl: 'http://localhost:4000',
      apiPrefix: 'api',
    },
  };

  const service = new MediaService(
    {} as never,
    config as never,
    {} as never,
  );

  it('produces a URL carrying an expiry and a signature', () => {
    const signed = service.sign('variant', 'abc-123');
    expect(signed.url).toContain('/api/media/stream/abc-123');
    expect(signed.url).toContain('exp=');
    expect(signed.url).toContain('sig=');
    expect(signed.expiresAt).toBeGreaterThan(Date.now());
  });

  it('accepts a signature it produced itself', () => {
    const expires = Math.floor(Date.now() / 1000) + 600;
    const signature = hmacSign(`variant:abc-123:${expires}`, SECRET);
    expect(() => service.verify('variant', 'abc-123', String(expires), signature)).not.toThrow();
  });

  it('rejects a missing signature', () => {
    expect(() => service.verify('variant', 'abc-123', '999999999', undefined)).toThrow(ForbiddenException);
  });

  it('rejects an expired link', () => {
    const expired = Math.floor(Date.now() / 1000) - 10;
    const signature = hmacSign(`variant:abc-123:${expired}`, SECRET);
    expect(() => service.verify('variant', 'abc-123', String(expired), signature)).toThrow(ForbiddenException);
  });

  it('rejects a signature minted for a different resource', () => {
    const expires = Math.floor(Date.now() / 1000) + 600;
    const signature = hmacSign(`variant:OTHER-ID:${expires}`, SECRET);
    expect(() => service.verify('variant', 'abc-123', String(expires), signature)).toThrow(ForbiddenException);
  });

  it('rejects a signature minted for a different resource kind', () => {
    const expires = Math.floor(Date.now() / 1000) + 600;
    const signature = hmacSign(`subtitle:abc-123:${expires}`, SECRET);
    expect(() => service.verify('variant', 'abc-123', String(expires), signature)).toThrow(ForbiddenException);
  });

  it('rejects a tampered signature', () => {
    const expires = Math.floor(Date.now() / 1000) + 600;
    const signature = hmacSign(`variant:abc-123:${expires}`, SECRET);
    expect(() => service.verify('variant', 'abc-123', String(expires), `${signature}x`)).toThrow(ForbiddenException);
  });
});
