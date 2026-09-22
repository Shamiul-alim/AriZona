import { describe, expect, it } from 'vitest';
import { cooldownElapsed, shouldArmPopunder, type PopunderContext } from './adsterra';
import { adScriptUrl, positiveNumber } from './config';

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function context(overrides: Partial<PopunderContext> = {}): PopunderContext {
  return {
    enabled: true,
    scriptSrc: '//ads.example.test/abc123/invoke.js',
    pathname: '/',
    status: 'anonymous',
    role: null,
    lastArmedAt: null,
    frequencyHours: 12,
    now: NOW,
    alreadyInjected: false,
    ...overrides,
  };
}

describe('shouldArmPopunder', () => {
  it('arms for a signed-out visitor on a public page', () => {
    expect(shouldArmPopunder(context())).toBe(true);
  });

  it('arms for a normal signed-in user', () => {
    expect(shouldArmPopunder(context({ status: 'authenticated', role: 'USER' }))).toBe(true);
  });

  it('does nothing when the integration is switched off or unconfigured', () => {
    expect(shouldArmPopunder(context({ enabled: false }))).toBe(false);
    expect(shouldArmPopunder(context({ scriptSrc: '' }))).toBe(false);
  });

  it('never arms inside the admin dashboard', () => {
    expect(shouldArmPopunder(context({ pathname: '/admin' }))).toBe(false);
    expect(shouldArmPopunder(context({ pathname: '/admin/anime/new' }))).toBe(false);
  });

  it('never arms during authentication flows', () => {
    expect(shouldArmPopunder(context({ pathname: '/auth/login' }))).toBe(false);
    expect(shouldArmPopunder(context({ pathname: '/auth/register' }))).toBe(false);
  });

  it('does not mistake a lookalike route for an excluded one', () => {
    expect(shouldArmPopunder(context({ pathname: '/administrators' }))).toBe(true);
    expect(shouldArmPopunder(context({ pathname: '/anime/authority' }))).toBe(true);
  });

  it('never arms for staff accounts, anywhere', () => {
    for (const role of ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const) {
      expect(shouldArmPopunder(context({ status: 'authenticated', role }))).toBe(false);
    }
  });

  it('waits until the session is known', () => {
    expect(shouldArmPopunder(context({ status: 'idle' }))).toBe(false);
    expect(shouldArmPopunder(context({ status: 'loading' }))).toBe(false);
  });

  it('respects the cooldown between armings', () => {
    expect(shouldArmPopunder(context({ lastArmedAt: NOW - 2 * HOUR }))).toBe(false);
    expect(shouldArmPopunder(context({ lastArmedAt: NOW - 13 * HOUR }))).toBe(true);
  });

  it('arms only once per page load', () => {
    expect(shouldArmPopunder(context({ alreadyInjected: true }))).toBe(false);
  });
});

describe('cooldownElapsed', () => {
  it('allows the first ever arming', () => {
    expect(cooldownElapsed(null, 12, NOW)).toBe(true);
  });

  it('treats a zero or invalid frequency as "no cooldown"', () => {
    expect(cooldownElapsed(NOW - 1000, 0, NOW)).toBe(true);
    expect(cooldownElapsed(NOW - 1000, Number.NaN, NOW)).toBe(true);
  });

  it('blocks inside the window and allows on the boundary', () => {
    expect(cooldownElapsed(NOW - 11 * HOUR, 12, NOW)).toBe(false);
    expect(cooldownElapsed(NOW - 12 * HOUR, 12, NOW)).toBe(true);
  });
});

describe('ad script URL parsing', () => {
  it('accepts a bare URL', () => {
    expect(adScriptUrl('https://ads.example.test/a/b/c.js')).toBe('https://ads.example.test/a/b/c.js');
  });

  it('extracts the URL from a pasted <script> tag', () => {
    // Exactly what an ad dashboard hands you, and what a person will paste.
    const tag = '<script src="https://ads.example.test/a/b/c.js"></script>';
    expect(adScriptUrl(tag)).toBe('https://ads.example.test/a/b/c.js');
  });

  it('handles single quotes and stray whitespace', () => {
    expect(adScriptUrl("  <script type='text/javascript' src='https://ads.example.test/x.js'></script>  ")).toBe(
      'https://ads.example.test/x.js',
    );
  });

  it('upgrades a protocol-relative URL', () => {
    expect(adScriptUrl('//ads.example.test/x.js')).toBe('https://ads.example.test/x.js');
  });

  it('discards anything that is not an http(s) URL', () => {
    // A relative path would silently 404 against our own origin.
    expect(adScriptUrl('/local-file.js')).toBe('');
    expect(adScriptUrl('javascript:alert(1)')).toBe('');
    expect(adScriptUrl('')).toBe('');
    expect(adScriptUrl(undefined)).toBe('');
  });
});

describe('positiveNumber', () => {
  it('uses the value when it is a positive number', () => {
    expect(positiveNumber('6', 12)).toBe(6);
  });

  it('falls back for empty, zero, negative and non-numeric values', () => {
    // An empty string is not nullish, so `??` would let 0 through and disable
    // the frequency cap entirely.
    expect(positiveNumber('', 12)).toBe(12);
    expect(positiveNumber('   ', 12)).toBe(12);
    expect(positiveNumber('0', 12)).toBe(12);
    expect(positiveNumber('-3', 12)).toBe(12);
    expect(positiveNumber('abc', 12)).toBe(12);
    expect(positiveNumber(undefined, 12)).toBe(12);
  });
});
