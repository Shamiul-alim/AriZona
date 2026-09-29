import { BadRequestException } from '@nestjs/common';
import { MasterUploadService } from './master-upload.service';

const PREFIX = 'master-6d8ab682-94fe-4007-8629-16b1dbc91529';

describe('MasterUploadService.safeName', () => {
  it('keeps the container and takes the rest of the name from the prefix', () => {
    for (const extension of ['mkv', 'mp4', 'm4v', 'mov', 'webm', 'ts', 'avi']) {
      expect(MasterUploadService.safeName(`Solo Leveling 01.${extension}`, PREFIX)).toEqual({
        name: `${PREFIX}.${extension}`,
        extension,
      });
    }
  });

  it('is case-insensitive about the extension', () => {
    expect(MasterUploadService.safeName('EPISODE.MKV', PREFIX).extension).toBe('mkv');
  });

  it('refuses a container the pipeline cannot handle', () => {
    for (const name of ['payload.sh', 'notes.txt', 'archive.zip', 'script.js', 'page.html']) {
      expect(() => MasterUploadService.safeName(name, PREFIX)).toThrow(BadRequestException);
    }
  });

  it('refuses a name with no extension rather than guessing a container', () => {
    // Guessing would only move the failure to ffprobe, long after the upload.
    expect(() => MasterUploadService.safeName('master', PREFIX)).toThrow(BadRequestException);
    expect(() => MasterUploadService.safeName('', PREFIX)).toThrow(BadRequestException);
  });

  it('strips every path component, so a traversal sequence cannot survive', () => {
    for (const name of [
      '../../etc/passwd.mkv',
      '..\\..\\windows\\system32\\config.mkv',
      '/absolute/path/episode.mkv',
      'C:\\Users\\someone\\episode.mkv',
      './././episode.mkv',
    ]) {
      const result = MasterUploadService.safeName(name, PREFIX);
      expect(result.name).toBe(`${PREFIX}.mkv`);
      expect(result.name).not.toContain('/');
      expect(result.name).not.toContain('\\');
      expect(result.name).not.toContain('..');
    }
  });

  it('carries nothing of the original name into the stored name', () => {
    // The name is built from ids we control, so quotes, newlines and control
    // characters in a user's filename cannot reach the storage API.
    const hostile = "ep'; DROP TABLE episodes; --\n\r\u0000<script>.mkv";
    expect(MasterUploadService.safeName(hostile, PREFIX).name).toBe(`${PREFIX}.mkv`);
  });

  it('gives the same input the same name, so a re-upload replaces rather than duplicates', () => {
    const a = MasterUploadService.safeName('take-one.mkv', PREFIX);
    const b = MasterUploadService.safeName('take-two.mkv', PREFIX);
    expect(a.name).toBe(b.name);
  });
});
