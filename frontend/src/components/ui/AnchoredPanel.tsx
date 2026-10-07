'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A panel that hangs off an input but is not laid out inside it.
 *
 * Card clips its contents with overflow-hidden so the header's rounded corners
 * stay clean, and an absolutely positioned dropdown inside one is cut off at the
 * card's edge — no z-index can win that, because the problem is clipping rather
 * than paint order. So the panel is rendered into document.body through a portal
 * and positioned over the anchor instead, which puts it outside every card's
 * clip and above the page's own stacking without anyone having to invent a
 * larger number.
 *
 * It follows the anchor on scroll and resize, closes on Escape or an outside
 * press, and matches the anchor's width so it still reads as part of the field.
 */
export function AnchoredPanel({
  anchorRef,
  open,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  // Measured in a layout effect so the panel never paints at the wrong place
  // for a frame before settling.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      setBox({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    // `true` so an ancestor scrolling counts, not only the window.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !box || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ top: box.top, left: box.left, width: box.width }}
      // z-50 is enough because nothing else is painted into body this way; the
      // panel is no longer competing with the cards at all.
      className="fixed z-50 max-h-[min(22rem,60vh)] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface py-1 shadow-2xl"
    >
      {children}
    </div>,
    document.body,
  );
}
