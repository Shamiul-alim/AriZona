import Link from 'next/link';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  children?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, href, linkLabel = 'View all', children }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2.5 text-[1.15rem] font-bold text-ink md:text-[1.3rem]">
          <span className="inline-block h-5 w-1 rounded-full bg-gradient-to-b from-brand-bright to-accent" />
          {title}
        </h2>
        {subtitle ? <p className="mt-1 pl-3.5 text-[13px] text-ink-faint">{subtitle}</p> : null}
      </div>

      <div className="flex items-center gap-2">
        {children}
        {href ? (
          <Link
            href={href}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-bright transition hover:bg-white/6"
          >
            {linkLabel} →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Pill tab group used by Latest Episodes and the Top Anime periods. */
export function TabGroup<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ value: T; label: string }>;
  active: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-surface p-1 ring-1 ring-line-soft">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          aria-pressed={active === tab.value}
          className={
            active === tab.value
              ? 'rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white'
              : 'rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-ink-muted transition hover:bg-white/6 hover:text-ink'
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
