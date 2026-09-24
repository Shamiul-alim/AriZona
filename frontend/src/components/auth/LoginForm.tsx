'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { PUBLIC_API_URL } from '@/lib/config';
import { postLoginPath } from '@/lib/auth-redirect';
import { PasswordField } from './PasswordField';
import { buttonClass, Field, inputClass } from './AuthShell';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, error, clearError, status, user } = useAuthStore();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  const returnTo = params.get('next') ?? params.get('returnTo');
  const oauthError = params.get('error');

  useEffect(() => {
    clearError();
    apiFetch<{ google: boolean }>('/auth/providers')
      .then((res) => setGoogleEnabled(res.google))
      .catch(() => setGoogleEnabled(false));
  }, [clearError]);

  // Already signed in (or just signed in): route by the role the server
  // returned, e.g. staff to /admin.
  useEffect(() => {
    if (status === 'authenticated' && user) router.replace(postLoginPath(user.role, returnTo));
  }, [status, user, router, returnTo]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(identifier.trim(), password, rememberMe);
      // Navigation happens in the effect above, once the session is stored.
    } catch {
      // The store already holds a user-facing message.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email or username">
        <input
          type="text"
          autoComplete="username"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
      </Field>

      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" required />

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
          />
          Remember me
        </label>
        <Link href="/auth/forgot-password" className="text-[13px] text-brand-bright hover:underline">
          Forgot password?
        </Link>
      </div>

      {error || oauthError ? (
        <p role="alert" className="rounded-lg bg-danger/12 px-3 py-2 text-[13px] text-danger">
          {error ?? (oauthError === 'google_cancelled' ? 'Google sign-in was cancelled.' : oauthError)}
        </p>
      ) : null}

      <button type="submit" disabled={submitting} className={buttonClass}>
        {submitting ? 'Signing in…' : 'Sign in'}
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
              <path
                fill="#4285F4"
                d="M23 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.17a5.28 5.28 0 0 1-2.29 3.46v2.88h3.7c2.17-2 3.42-4.94 3.42-8.53Z"
              />
              <path
                fill="#34A853"
                d="M12 23.5c3.1 0 5.7-1.03 7.58-2.78l-3.7-2.88c-1.03.69-2.35 1.09-3.88 1.09-2.98 0-5.5-2.01-6.4-4.72H1.77v2.97A11.48 11.48 0 0 0 12 23.5Z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.21a6.9 6.9 0 0 1 0-4.41V6.83H1.77a11.5 11.5 0 0 0 0 10.34l3.83-2.96Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.07c1.68 0 3.19.58 4.38 1.71l3.28-3.28C17.7 1.6 15.1.5 12 .5 7.53.5 3.67 3.07 1.77 6.83L5.6 9.8c.9-2.71 3.42-4.72 6.4-4.72Z"
              />
            </svg>
            Continue with Google
          </a>
        </>
      ) : null}
    </form>
  );
}
