import { cn } from '@/lib/utils';

/**
 * The one dropdown appearance used across AniZora.
 *
 * Every select on the site used to carry its own hand-written class list: five
 * different heights, four text sizes, two backgrounds, no hover state, no
 * disabled or error treatment, and the browser's default arrow. These tokens
 * replace all of that.
 *
 * There are three sizes rather than one, because a select should match the text
 * input standing next to it: `md` matches the public inputs (h-11), `admin`
 * matches the admin inputs (h-10), `sm` is for dense toolbars. Everything else —
 * border, surface, radius, chevron, hover, focus ring, disabled, error — is
 * shared, which is where the visual consistency actually comes from.
 *
 * The control stays a native <select>: keyboard behaviour comes free and phones
 * get the OS picker. See `.select-field` in globals.css for the chrome.
 */
const BASE =
  'select-field w-full rounded-lg border bg-base text-ink transition ' +
  'hover:border-line disabled:hover:border-line-soft ' +
  'focus:border-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/35';

const SIZES = {
  /** Public forms — matches `inputClass`. */
  md: 'h-11 pl-3.5 pr-10 text-[14px]',
  /** Admin forms — matches `adminInput`. A coarse pointer still gets 44px. */
  admin: 'h-10 pl-3 pr-9 text-[13.5px] pointer-coarse:h-11',
  /** Dense filter and sort bars. A coarse pointer still gets a 44px control. */
  sm: 'h-9 pl-3 pr-9 text-[13px] pointer-coarse:h-11',
} as const;

export type SelectSize = keyof typeof SIZES;

/** The class list for a native <select>. `invalid` switches on the error border. */
export function selectClass(size: SelectSize = 'md', invalid = false): string {
  return cn(BASE, SIZES[size], invalid ? 'border-danger/70 focus:border-danger' : 'border-line-soft');
}

/** Public default, for the common case. */
export const selectField = selectClass('md');

/** Dense toolbars. */
export const selectFieldSm = selectClass('sm');

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: SelectSize;
  /** Marks the field invalid and wires aria-invalid for assistive tech. */
  invalid?: boolean;
}

/**
 * A native <select> carrying the shared appearance. Use it for new code; the
 * exported class strings exist for the many places that already render their own
 * <select> and only need the styling.
 */
export function Select({ size = 'md', invalid = false, className, ...props }: SelectProps) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(selectClass(size, invalid), className)}
    />
  );
}
