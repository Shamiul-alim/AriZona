import { SITE_NAME } from '@/lib/config';

/**
 * Original wordmark: an abstract mark built from two offset arcs and a dot,
 * suggesting a play head sweeping through an arc. No third-party artwork.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="logo-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9a80ff" />
            <stop offset="100%" stopColor="#5b3fd6" />
          </linearGradient>
          <linearGradient id="logo-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22e1c8" />
            <stop offset="100%" stopColor="#14b8a3" />
          </linearGradient>
        </defs>
        <path
          d="M16 3a13 13 0 0 1 12.2 8.6"
          fill="none"
          stroke="url(#logo-b)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path
          d="M28.6 17.4A13 13 0 1 1 9.4 5.6"
          fill="none"
          stroke="url(#logo-a)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path d="M13.6 11.6a1 1 0 0 1 1.52-.85l6 3.9a1 1 0 0 1 0 1.7l-6 3.9a1 1 0 0 1-1.52-.85v-7.8Z" fill="#f2f3fb" />
      </svg>
      <span className="text-[1.15rem] font-extrabold tracking-tight text-ink">
        {SITE_NAME.slice(0, 3)}
        <span className="text-brand-bright">{SITE_NAME.slice(3)}</span>
      </span>
    </span>
  );
}
