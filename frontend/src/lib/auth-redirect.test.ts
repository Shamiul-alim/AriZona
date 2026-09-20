import { describe, expect, it } from 'vitest';
import { postLoginPath, safeReturnPath } from './auth-redirect';

describe('safeReturnPath', () => {
  it('accepts same-site paths', () => {
    expect(safeReturnPath('/watch/foo/ep-1')).toBe('/watch/foo/ep-1');
  });

  it('rejects other sites, protocol-relative URLs and auth pages', () => {
    expect(safeReturnPath('https://evil.example')).toBeNull();
    expect(safeReturnPath('//evil.example')).toBeNull();
    expect(safeReturnPath('/\\evil.example')).toBeNull();
    expect(safeReturnPath('/auth/login')).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
});

describe('postLoginPath', () => {
  it('sends admins and super admins to the dashboard', () => {
    expect(postLoginPath('ADMIN', null)).toBe('/admin');
    expect(postLoginPath('SUPER_ADMIN', '/')).toBe('/admin');
  });

  it('sends moderators to the dashboard (their moderation tools live there)', () => {
    expect(postLoginPath('MODERATOR', null)).toBe('/admin');
  });

  it('sends regular users home', () => {
    expect(postLoginPath('USER', null)).toBe('/');
  });

  it('honours an explicit return path', () => {
    expect(postLoginPath('USER', '/watch/foo/ep-2')).toBe('/watch/foo/ep-2');
    expect(postLoginPath('ADMIN', '/admin/anime')).toBe('/admin/anime');
  });

  it('never sends a regular user into /admin', () => {
    expect(postLoginPath('USER', '/admin')).toBe('/');
  });
});
