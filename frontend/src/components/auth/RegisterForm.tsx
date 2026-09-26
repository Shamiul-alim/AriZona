'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { postLoginPath } from '@/lib/auth-redirect';
import { cn } from '@/lib/utils';
import { GoogleAuthButton } from './GoogleAuthButton';
import { PasswordField } from './PasswordField';
import { buttonClass, Field, inputClass } from './AuthShell';

/** Mirrors the server-side rule so the user is not surprised by a 400. */
const RULES = [
  { test: (v: string) => v.length >= 8, label: 'At least 8 characters' },
  { test: (v: string) => /[a-z]/.test(v), label: 'A lowercase letter' },
  { test: (v: string) => /[A-Z]/.test(v), label: 'An uppercase letter' },
  { test: (v: string) => /\d/.test(v), label: 'A number' },
];

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { register, error, clearError, status, user } = useAuthStore();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const returnTo = params.get('next');

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (status === 'authenticated' && user) router.replace(postLoginPath(user.role, returnTo));
  }, [status, user, router, returnTo]);

  const passed = useMemo(() => RULES.map((rule) => rule.test(password)), [password]);
  const usernameValid = /^[a-zA-Z0-9_]{3,24}$/.test(username);
  const canSubmit = passed.every(Boolean) && usernameValid && email.includes('@');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await register(email.trim().toLowerCase(), username.trim(), password);
      // Navigation happens in the effect above, once the session is stored.
    } catch {
      // Message is already in the store.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
      </Field>

      <Field
        label="Username"
        error={username && !usernameValid ? '3–24 characters, letters, numbers and underscores only' : undefined}
        hint={!username ? 'This is how you will appear in comments and on the leaderboard' : undefined}
      >
        <input
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your_name"
          className={inputClass}
        />
      </Field>

      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" required />

      <ul className="grid grid-cols-2 gap-1.5">
        {RULES.map((rule, index) => (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-1.5 text-[11.5px] transition-colors',
              password && passed[index] ? 'text-ok' : 'text-ink-faint',
            )}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.6}>
              {password && passed[index] ? (
                <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <circle cx="12" cy="12" r="7" />
              )}
            </svg>
            {rule.label}
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/12 px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={submitting || !canSubmit} className={buttonClass}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <GoogleAuthButton label="Sign up with Google" />

      <p className="text-center text-[11.5px] leading-relaxed text-ink-faint">
        By creating an account you agree to follow the community rules.
      </p>
    </form>
  );
}
