'use client';

import { useEffect } from 'react';

/**
 * The shared appearance for a popover menu panel.
 *
 * The four panels on the site (account menu, search suggestions, the nav
 * dropdown, the watchlist status menu) had almost this surface already, but two
 * carried no z-index at all and a third sat at z-30, so whether a menu rendered
 * above the page was down to which stacking context it happened to land in. One
 * token fixes the appearance and the stacking together.
 *
 * Callers still own position (which edge to anchor to, and whether to open
 * upward), because only they know where they sit.
 */
export const menuPanel =
  'z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl';

/** A row inside a menu panel. Comfortable to tap, obvious on hover and focus. */
export const menuItem =
  'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-ink-soft transition ' +
  'hover:bg-white/6 hover:text-ink focus-visible:bg-white/8 focus-visible:text-ink focus-visible:outline-none ' +
  'pointer-coarse:py-3';

/** The same row, for the currently selected choice. */
export const menuItemActive =
  'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-ink transition ' +
  'bg-brand/15 hover:bg-brand/20 focus-visible:outline-none pointer-coarse:py-3';

/**
 * Closes an open menu on Escape and returns focus to the button that opened it.
 *
 * Click-outside is deliberately not handled here: the header already does it on
 * mousedown for its own reasons (a click that lands after the menu closes never
 * reaches the button), and duplicating it would fight that. This covers the part
 * that was missing everywhere — a keyboard user could open these menus but not
 * close them without tabbing out.
 */
export function useMenuEscape(open: boolean, close: () => void, triggerRef?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      triggerRef?.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close, triggerRef]);
}
