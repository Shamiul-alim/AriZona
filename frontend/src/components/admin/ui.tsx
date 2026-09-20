'use client';

import { cn } from '@/lib/utils';

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
  'h-10 w-full rounded-lg border border-line-soft bg-base px-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60';

export const adminTextarea =
  'w-full resize-y rounded-lg border border-line-soft bg-base px-3 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60';

export const adminSelect =
  'h-10 w-full rounded-lg border border-line-soft bg-base px-3 text-[13.5px] text-ink outline-none focus:border-brand/60';

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
