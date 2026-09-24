'use client';

import { useId, useState } from 'react';
import { Field, inputClass } from './AuthShell';
import { cn } from '@/lib/utils';

/**
 * A password input with a show/hide eye toggle, shared by sign-in, sign-up and
 * password reset so all three behave and look the same.
 *
 * The toggle is a real <button type="button">, so it is keyboard reachable and
 * cannot submit the form. Only the input's `type` changes — its name, value and
 * autoComplete are untouched, which is what keeps password managers and
 * autofill working. The input reserves room for the icon at all times, so
 * revealing the password never shifts the layout or slides text under the icon.
 */

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path
        d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4M6.4 7.7A16.8 16.8 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.9-.4 4.1-1M4 4l16 16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.2 10.3a2.6 2.6 0 0 0 3.6 3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** "current-password" when signing in, "new-password" when setting one. */
  autoComplete: 'current-password' | 'new-password';
  name?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  name = 'password',
  placeholder = '••••••••',
  hint,
  error,
  required,
  autoFocus,
  inputRef,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const describedBy = useId();

  return (
    <Field label={label} hint={hint} error={error}>
      <div className="relative">
        <input
          ref={inputRef}
          type={visible ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          required={required}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={describedBy}
          // Room for the icon is reserved whether or not the text is visible.
          className={cn(inputClass, 'pr-11')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          title={visible ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-ink-muted transition hover:bg-white/8 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          {visible ? <EyeOffIcon className="h-[18px] w-[18px]" /> : <EyeIcon className="h-[18px] w-[18px]" />}
        </button>
        <span id={describedBy} className="sr-only">
          {visible ? 'Password is visible' : 'Password is hidden'}
        </span>
      </div>
    </Field>
  );
}
