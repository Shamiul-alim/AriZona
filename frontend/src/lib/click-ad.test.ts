import { beforeEach, describe, expect, it } from 'vitest';
import { clickAdTarget, isPlainPrimaryClick, isRouteExcluded, mayOpenClickAd, type ClickAdContext } from './adsterra';
import { ADSTERRA } from './config';
import { adOpenedInThisGesture, lastAdAt, markAdOpened, resetAdRuntime, SAME_GESTURE_MS } from './ad-runtime';

const NOW = 1_800_000_000_000;
const EXCLUDED = ['/auth', '/admin'];

function ctx(overrides: Partial<ClickAdContext> = {}): ClickAdContext {
  return {
    enabled: true,
    pathname: '/',
    status: 'anonymous',
    role: null,
    excludedRoutes: EXCLUDED,
    lastClickAdAt: null,
    cooldownMs: 5000,
    now: NOW,
    adAlreadyOpenedInGesture: false,
    ...overrides,
  };
}

function render(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('mayOpenClickAd', () => {
  it('allows an ordinary visitor on a public page', () => {
    expect(mayOpenClickAd(ctx())).toBe(true);
    expect(mayOpenClickAd(ctx({ status: 'authenticated', role: 'USER' }))).toBe(true);
  });

  it('never fires on auth or admin routes', () => {
    for (const pathname of ['/auth', '/auth/login', '/auth/forgot-password', '/admin', '/admin/anime/new']) {
      expect(mayOpenClickAd(ctx({ pathname }))).toBe(false);
    }
  });

  it('leaves the watch page eligible — the player subtree is refused instead', () => {
    expect(mayOpenClickAd(ctx({ pathname: '/watch/sintel/ep-1' }))).toBe(true);
  });

  it('never fires for staff, or before the session is known', () => {
    for (const role of ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const) {
      expect(mayOpenClickAd(ctx({ status: 'authenticated', role }))).toBe(false);
    }
    expect(mayOpenClickAd(ctx({ status: 'loading' }))).toBe(false);
    expect(mayOpenClickAd(ctx({ enabled: false }))).toBe(false);
  });

  it('holds off during the cooldown and resumes after it', () => {
    expect(mayOpenClickAd(ctx({ lastClickAdAt: NOW - 1000 }))).toBe(false);
    expect(mayOpenClickAd(ctx({ lastClickAdAt: NOW - 4999 }))).toBe(false);
    expect(mayOpenClickAd(ctx({ lastClickAdAt: NOW - 5000 }))).toBe(true);
  });

  it('never fires when another mechanism already opened one for this click', () => {
    // The popunder acts on mousedown; this runs on the click that follows.
    expect(mayOpenClickAd(ctx({ adAlreadyOpenedInGesture: true }))).toBe(false);
  });
});

describe('clickAdTarget', () => {
  it('accepts ordinary internal navigation: cards, titles, genres, pagination', () => {
    const body = render(`
      <main>
        <a href="/anime/crimson-vanguard" id="card"><img alt=""><span id="title">Crimson Vanguard</span></a>
        <a href="/genres/action" id="genre">Action</a>
        <a href="/browse?page=2" id="page">2</a>
      </main>`);
    for (const id of ['card', 'title', 'genre', 'page']) {
      expect(clickAdTarget(body.querySelector(`#${id}`)).eligible, id).toBe(true);
    }
    expect(clickAdTarget(body.querySelector('#card')).href).toBe('/anime/crimson-vanguard');
  });

  it('never fires anywhere inside the video player', () => {
    const body = render(`
      <div class="player-root">
        <video></video>
        <div><button aria-label="Fullscreen" id="fs"></button><a href="/watch/x/ep-2" id="next">Next</a></div>
        <div role="dialog" aria-label="Player settings"><button id="q">720p</button></div>
      </div>`);
    for (const id of ['fs', 'next', 'q']) {
      expect(clickAdTarget(body.querySelector(`#${id}`)).eligible, id).toBe(false);
    }
  });

  it('never fires from forms, inputs or our own ad units', () => {
    const body = render(`
      <form><input id="search" type="search"><button id="submit">Go</button></form>
      <label id="lab">Remember me</label>
      <select id="sel"></select>
      <aside aria-label="Advertisement"><a href="/anime/x" id="inad">ad</a></aside>
      <div data-no-ad><a href="/anime/y" id="opted">no</a></div>
      <div role="dialog"><a href="/anime/z" id="dlg">dialog link</a></div>`);
    for (const id of ['search', 'submit', 'lab', 'sel', 'inad', 'opted', 'dlg']) {
      expect(clickAdTarget(body.querySelector(`#${id}`)).eligible, id).toBe(false);
    }
  });

  it('leaves external links, downloads and new-tab links alone', () => {
    const body = render(`
      <a href="https://example.com/x" id="ext">external</a>
      <a href="/file.zip" download id="dl">download</a>
      <a href="/anime/x" target="_blank" id="blank">new tab</a>
      <a href="#top" id="hash">top</a>
      <a href="mailto:a@b.c" id="mail">mail</a>
      <span id="plain">not a link</span>`);
    for (const id of ['ext', 'dl', 'blank', 'hash', 'mail', 'plain']) {
      expect(clickAdTarget(body.querySelector(`#${id}`)).eligible, id).toBe(false);
    }
  });

  it('accepts an element explicitly marked as eligible', () => {
    const body = render('<div data-click-ad="true"><span id="inner">load more</span></div>');
    expect(clickAdTarget(body.querySelector('#inner')).eligible).toBe(true);
  });
});

describe('isPlainPrimaryClick', () => {
  const event = (over: Partial<MouseEvent> = {}) =>
    ({ isTrusted: true, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over }) as MouseEvent;

  it('accepts a real left-click', () => {
    expect(isPlainPrimaryClick(event())).toBe(true);
  });

  it('ignores synthetic clicks, middle-clicks and open-in-new-tab clicks', () => {
    // A synthetic click is our own replayed navigation, not a new interaction.
    expect(isPlainPrimaryClick(event({ isTrusted: false }))).toBe(false);
    expect(isPlainPrimaryClick(event({ button: 1 }))).toBe(false);
    for (const key of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const) {
      expect(isPlainPrimaryClick(event({ [key]: true })), key).toBe(false);
    }
  });
});

describe('ad-runtime coordination', () => {
  beforeEach(() => {
    resetAdRuntime();
    window.localStorage.clear();
  });

  it('remembers each mechanism separately', () => {
    markAdOpened('popunder', NOW);
    expect(lastAdAt('popunder')).toBe(NOW);
    expect(lastAdAt('click')).toBe(0);
  });

  it('reports a popunder from this gesture, so the click ad stands down', () => {
    markAdOpened('popunder', NOW);
    expect(adOpenedInThisGesture(NOW + 40)).toBe(true);
    expect(adOpenedInThisGesture(NOW + SAME_GESTURE_MS + 1)).toBe(false);
  });

  it('survives a page load through storage', () => {
    markAdOpened('click', NOW);
    resetAdRuntime(); // as if the page had been reloaded
    expect(lastAdAt('click')).toBe(NOW);
  });
});

describe('admin is never an advertising surface', () => {
  it('is listed as a route where nothing ad-related mounts', () => {
    expect(ADSTERRA.neverRoutes).toContain('/admin');
  });

  it('matches every admin page, and nothing that merely looks like one', () => {
    for (const path of ['/admin', '/admin/anime', '/admin/anime/123', '/admin/users']) {
      expect(isRouteExcluded(path, ADSTERRA.neverRoutes), path).toBe(true);
    }
    expect(isRouteExcluded('/administrators', ADSTERRA.neverRoutes)).toBe(false);
  });

  it('is also refused by each mechanism on its own', () => {
    expect(mayOpenClickAd(ctx({ pathname: '/admin/anime' }))).toBe(false);
    expect(ADSTERRA.popunder.excludedRoutes).toContain('/admin');
    expect(ADSTERRA.banners.excludedRoutes).toContain('/admin');
  });
});
