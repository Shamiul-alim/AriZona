import { describe, expect, it } from 'vitest';
import {
  cooldownRemaining,
  isPopunderActive,
  isRouteExcluded,
  popunderGateCss,
  shouldLoadPopunder,
  type PopunderActiveContext,
  type PopunderLoadContext,
} from './adsterra';
import { adScriptUrl, placementKeyFromSrc, positiveNumber, routeList } from './config';

const MIN = 60 * 1000;
const NOW = 1_800_000_000_000;
const EXCLUDED = ['/auth', '/admin', '/watch'];

function load(overrides: Partial<PopunderLoadContext> = {}): PopunderLoadContext {
  return { enabled: true, pathname: '/', status: 'anonymous', role: null, excludedRoutes: EXCLUDED, alreadyInjected: false, ...overrides };
}

function active(overrides: Partial<PopunderActiveContext> = {}): PopunderActiveContext {
  return {
    enabled: true, pathname: '/', status: 'anonymous', role: null, excludedRoutes: EXCLUDED,
    lastPopAt: null, cooldownMs: 5 * MIN, now: NOW, ...overrides,
  };
}

describe('isRouteExcluded', () => {
  it('matches a prefix and everything beneath it', () => {
    expect(isRouteExcluded('/auth', EXCLUDED)).toBe(true);
    expect(isRouteExcluded('/auth/login', EXCLUDED)).toBe(true);
    expect(isRouteExcluded('/watch/sintel/ep-1', EXCLUDED)).toBe(true);
    expect(isRouteExcluded('/admin/anime/new', EXCLUDED)).toBe(true);
  });

  it('does not mistake a lookalike route for an excluded one', () => {
    expect(isRouteExcluded('/administrators', EXCLUDED)).toBe(false);
    expect(isRouteExcluded('/watchlist', EXCLUDED)).toBe(false);
    expect(isRouteExcluded('/anime/authority', EXCLUDED)).toBe(false);
  });
});

describe('shouldLoadPopunder', () => {
  it('loads for a visitor on a public page', () => {
    expect(shouldLoadPopunder(load())).toBe(true);
    expect(shouldLoadPopunder(load({ status: 'authenticated', role: 'USER' }))).toBe(true);
  });

  it('loads at most once per document', () => {
    expect(shouldLoadPopunder(load({ alreadyInjected: true }))).toBe(false);
  });

  it('never loads on auth, admin or the watch page', () => {
    for (const pathname of ['/auth/login', '/auth/forgot-password', '/admin', '/watch/sintel/ep-1']) {
      expect(shouldLoadPopunder(load({ pathname }))).toBe(false);
    }
  });

  it('never loads for staff, and waits for the session', () => {
    for (const role of ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const) {
      expect(shouldLoadPopunder(load({ status: 'authenticated', role }))).toBe(false);
    }
    expect(shouldLoadPopunder(load({ status: 'loading' }))).toBe(false);
    expect(shouldLoadPopunder(load({ enabled: false }))).toBe(false);
  });
});

describe('isPopunderActive', () => {
  it('is clickable on an eligible page with no recent impression', () => {
    expect(isPopunderActive(active())).toBe(true);
  });

  it('is disabled on excluded routes even after the script loaded elsewhere', () => {
    // The layer follows client-side navigation; the gate is what stops it.
    expect(isPopunderActive(active({ pathname: '/auth/login' }))).toBe(false);
    expect(isPopunderActive(active({ pathname: '/watch/x/ep-1' }))).toBe(false);
  });

  it('is disabled for staff', () => {
    expect(isPopunderActive(active({ status: 'authenticated', role: 'ADMIN' }))).toBe(false);
  });

  it('is disabled during the cooldown and re-enabled after it', () => {
    expect(isPopunderActive(active({ lastPopAt: NOW - 1 * MIN }))).toBe(false);
    expect(isPopunderActive(active({ lastPopAt: NOW - 5 * MIN }))).toBe(true);
    expect(isPopunderActive(active({ lastPopAt: NOW - 30 * MIN }))).toBe(true);
  });
});

describe('cooldownRemaining', () => {
  it('reports how long until the next popunder may open', () => {
    expect(cooldownRemaining(null, 5 * MIN, NOW)).toBe(0);
    expect(cooldownRemaining(NOW - 2 * MIN, 5 * MIN, NOW)).toBe(3 * MIN);
    expect(cooldownRemaining(NOW - 6 * MIN, 5 * MIN, NOW)).toBe(0);
  });

  it('never locks ads out because of a bad timestamp or zero cooldown', () => {
    expect(cooldownRemaining(NOW + 60 * MIN, 5 * MIN, NOW)).toBe(0);
    expect(cooldownRemaining(Number.NaN, 5 * MIN, NOW)).toBe(0);
    expect(cooldownRemaining(NOW - 1000, 0, NOW)).toBe(0);
  });
});

describe('popunderGateCss', () => {
  const KEY = 'b6b5afe0063ae2809cdf748ffd1f190e';

  it('hides the layer unless the gate is explicitly open', () => {
    const css = popunderGateCss(KEY);
    expect(css).toContain('html:not([data-popunder="on"])');
    expect(css).toContain(`a[href*="${KEY}"]`);
    expect(css).toContain('pointer-events:none');
  });

  it('refuses anything that is not a placement key', () => {
    expect(popunderGateCss('')).toBe('');
    expect(popunderGateCss('"] body{display:none}')).toBe('');
  });
});

describe('placementKeyFromSrc', () => {
  it('reads the key from both Adsterra URL shapes', () => {
    expect(placementKeyFromSrc('https://pl1.example.test/b6/b5/af/b6b5afe0063ae2809cdf748ffd1f190e.js')).toBe(
      'b6b5afe0063ae2809cdf748ffd1f190e',
    );
    expect(placementKeyFromSrc('https://pl2.example.test/5244bd78490b6bf38c7c2f850281cbf0/invoke.js')).toBe(
      '5244bd78490b6bf38c7c2f850281cbf0',
    );
    expect(placementKeyFromSrc('')).toBe('');
  });
});

describe('routeList', () => {
  it('parses prefixes and falls back when empty', () => {
    expect(routeList('/auth, /admin ,/watch', [])).toEqual(['/auth', '/admin', '/watch']);
    expect(routeList('', ['/auth'])).toEqual(['/auth']);
    expect(routeList('nonsense', ['/auth'])).toEqual(['/auth']);
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
