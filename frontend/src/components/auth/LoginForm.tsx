'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { postLoginPath } from '@/lib/auth-redirect';
import { GoogleAuthButton } from './GoogleAuthButton';
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

  const returnTo = params.get('next') ?? params.get('returnTo');
  const oauthError = params.get('error');

  useEffect(() => {
    clearError();
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

      <GoogleAuthButton label="Continue with Google" />
    </form>
  );
}
