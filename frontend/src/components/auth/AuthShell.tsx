import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-7 text-center">
        <Link href="/" className="inline-block" aria-label="Home">
          <Logo />
        </Link>
        <h1 className="mt-6 text-[1.5rem] font-extrabold text-ink">{title}</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{subtitle}</p>
      </div>

      <div className="card-surface p-6">{children}</div>

      {footer ? <div className="mt-5 text-center text-[13px] text-ink-muted">{footer}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11.5px] text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  'h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60';

export const buttonClass =
  'h-11 w-full rounded-lg bg-brand text-[14px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-60';
