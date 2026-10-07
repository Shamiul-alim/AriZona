'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AnchoredPanel } from './AnchoredPanel';

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional second line, for options whose label needs qualifying. */
  hint?: string;
}

/**
 * A listbox for choosing one of a short set of options.
 *
 * A native `<select>` is still the right control for most fields on this site —
 * it is keyboard-complete for free, and a phone gives you the OS picker, which
 * beats anything written here. What it cannot do is look like the rest of the
 * site once it is open: the option list is drawn by the browser, so a carefully
 * styled control opens into grey system chrome.
 *
 * So this exists for the few places where the open menu is part of the page's
 * character rather than a form field to be filled in — the sort control above a
 * catalogue, say. It is deliberately not a general replacement: thirty years or
 * every genre belong in a native select, where the platform handles typing and
 * scrolling better than this does.
 *
 * Keyboard behaviour mirrors the native control closely enough to be
 * unsurprising: arrows move, Home and End jump, Enter and Space choose, Escape
 * closes and hands focus back to the trigger, Tab leaves, and typing a letter
 * jumps to the next option starting with it.
 */
export function Dropdown({
  value,
  options,
  onChange,
  label,
  className,
  size = 'sm',
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Accessible name for the control. */
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const choose = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      onChange(option.value);
      close();
    },
    [options, onChange, close],
  );

  // Opening lands on the current choice, which is where someone looking to
  // change it expects to start.
  const openMenu = useCallback(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [selectedIndex]);

  // The DOM focus moves with the highlight rather than only
  // aria-activedescendant, which keeps the browser's idea of focus and the
  // visible selection in step while the list lives in a portal.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex];
    node?.focus();
  }, [open, activeIndex]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = options.length - 1;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((i) => {
        const next = i + step;
        return next < 0 ? last : next > last ? 0 : next;
      });
      return;
    }

    if (event.key === 'Home' && open) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End' && open) {
      event.preventDefault();
      setActiveIndex(last);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(activeIndex);
      else openMenu();
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'Tab' && open) {
      close(false);
      return;
    }

    // Type-ahead: one printable character jumps to the next matching option.
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    const needle = event.key.toLowerCase();
    const from = open ? activeIndex + 1 : 0;
    const rotated = [...options.slice(from), ...options.slice(0, from)];
    const hit = rotated.find((o) => o.label.toLowerCase().startsWith(needle));
    if (!hit) return;
    event.preventDefault();
    const index = options.indexOf(hit);
    if (open) setActiveIndex(index);
    else choose(index);
  };

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-lg border bg-base text-ink transition',
          'hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35',
          open ? 'border-brand/60' : 'border-line-soft',
          size === 'sm' ? 'h-9 pl-3 pr-2.5 text-[13px] pointer-coarse:h-11' : 'h-11 pl-3.5 pr-3 text-[14px]',
        )}
      >
        <span className="truncate">{selected?.label ?? 'Select…'}</span>
        <svg
          viewBox="0 0 24 24"
          className={cn('h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <AnchoredPanel anchorRef={triggerRef} open={open} onClose={() => close(false)}>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          onKeyDown={onKeyDown}
          // Only opacity and transform animate, so opening costs no layout work.
          className="dropdown-enter motion-reduce:animate-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => choose(index)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex cursor-pointer items-start gap-2 px-3 py-2 text-[13px] outline-none transition-colors',
                  'pointer-coarse:py-2.5',
                  index === activeIndex ? 'bg-white/8 text-ink' : 'text-ink-soft',
                  isSelected && 'font-semibold text-ink',
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={cn('mt-[3px] h-3.5 w-3.5 shrink-0', isSelected ? 'text-brand-bright' : 'opacity-0')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="block truncate text-[11.5px] font-normal text-ink-faint">{option.hint}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </AnchoredPanel>
    </div>
  );
}
