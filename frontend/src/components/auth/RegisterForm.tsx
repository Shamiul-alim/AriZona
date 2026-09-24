'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { PUBLIC_API_URL } from '@/lib/config';
import { postLoginPath } from '@/lib/auth-redirect';
import { cn } from '@/lib/utils';
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
  const [googleEnabled, setGoogleEnabled] = useState(false);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const returnTo = params.get('next');

  useEffect(() => {
    clearError();
    apiFetch<{ google: boolean }>('/auth/providers')
      .then((res) => setGoogleEnabled(res.google))
      .catch(() => setGoogleEnabled(false));
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

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-line-soft" />
            <span className="text-[11.5px] uppercase tracking-wider text-ink-faint">or</span>
            <span className="h-px flex-1 bg-line-soft" />
          </div>
          <a
            href={`${PUBLIC_API_URL}/auth/google`}
            rel="nofollow"
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface-2 text-[14px] font-semibold text-ink transition hover:bg-surface-3"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
              <path fill="#4285F4" d="M23 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.17a5.28 5.28 0 0 1-2.29 3.46v2.88h3.7c2.17-2 3.42-4.94 3.42-8.53Z" />
              <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.58-2.78l-3.7-2.88c-1.03.69-2.35 1.09-3.88 1.09-2.98 0-5.5-2.01-6.4-4.72H1.77v2.97A11.48 11.48 0 0 0 12 23.5Z" />
              <path fill="#FBBC05" d="M5.6 14.21a6.9 6.9 0 0 1 0-4.41V6.83H1.77a11.5 11.5 0 0 0 0 10.34l3.83-2.96Z" />
              <path fill="#EA4335" d="M12 5.07c1.68 0 3.19.58 4.38 1.71l3.28-3.28C17.7 1.6 15.1.5 12 .5 7.53.5 3.67 3.07 1.77 6.83L5.6 9.8c.9-2.71 3.42-4.72 6.4-4.72Z" />
            </svg>
            Sign up with Google
          </a>
        </>
      ) : null}

      <p className="text-center text-[11.5px] leading-relaxed text-ink-faint">
        By creating an account you agree to follow the community rules.
      </p>
    </form>
  );
}
