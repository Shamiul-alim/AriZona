'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { selectClass } from '@/components/ui/Select';

/** Small shared kit so every admin screen looks and behaves the same. */

export function AdminHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.5rem] font-extrabold text-ink">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-ink-muted">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </header>
  );
}

export const adminInput =
  // pointer-coarse matches the select beside it, so a phone gets a 44px row for
  // both rather than a 44px dropdown next to a 40px field.
  'h-10 w-full rounded-lg border border-line-soft bg-base px-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60 pointer-coarse:h-11';

export const adminTextarea =
  'w-full resize-y rounded-lg border border-line-soft bg-base px-3 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60';

/**
 * The admin select. Delegates to the shared appearance so admin and public
 * dropdowns cannot drift apart, at the height that matches `adminInput`.
 */
export const adminSelect = selectClass('admin');

export function Label({
  children,
  hint,
  required,
}: {
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <span className="mb-1.5 block">
      <span className="text-[12.5px] font-semibold text-ink-soft">
        {children}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {hint ? <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-faint">{hint}</span> : null}
    </span>
  );
}

export function Card({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card-surface overflow-hidden">
      {title ? (
        <header className="border-b border-line-soft px-4 py-3">
          <h2 className="text-[14px] font-bold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">{description}</p> : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-10 px-4 text-[13.5px]',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-bright',
        variant === 'secondary' && 'border border-line bg-surface text-ink-soft hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'border border-danger/40 text-danger hover:bg-danger/10',
        variant === 'ghost' && 'text-ink-muted hover:bg-white/6 hover:text-ink',
        className,
      )}
    />
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'info' && 'bg-brand/20 text-brand-bright',
        tone === 'neutral' && 'bg-surface-2 text-ink-muted',
      )}
    >
      {children}
    </span>
  );
}

export function Banner({ state }: { state: { tone: 'ok' | 'error'; text: string } | null }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={cn(
        'rounded-lg px-3 py-2 text-[13px]',
        state.tone === 'ok' ? 'bg-ok/12 text-ok' : 'bg-danger/12 text-danger',
      )}
    >
      {state.text}
    </p>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <p className="text-[14px] font-medium text-ink-soft">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-faint">{body}</p>
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-14 rounded-lg" />
      ))}
    </div>
  );
}

export function Pager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-center gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="px-2 text-[12.5px] tabular-nums text-ink-faint">
        {page} / {totalPages}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}

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
