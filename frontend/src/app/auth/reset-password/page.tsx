'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AuthShell, buttonClass, Field, inputClass } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';

const RULES = [
  { test: (v: string) => v.length >= 8, label: 'At least 8 characters' },
  { test: (v: string) => /[a-z]/.test(v), label: 'A lowercase letter' },
  { test: (v: string) => /[A-Z]/.test(v), label: 'An uppercase letter' },
  { test: (v: string) => /\d/.test(v), label: 'A number' },
];

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const passed = useMemo(() => RULES.map((rule) => rule.test(password)), [password]);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = passed.every(Boolean) && matches && token.length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setState('saving');
    setError(null);
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: { token, password } });
      setState('done');
      setTimeout(() => router.push('/auth/login'), 2200);
    } catch (e) {
      setState('idle');
      setError(e instanceof Error ? e.message : 'Could not reset your password.');
    }
  };

  if (!token) {
    return (
      <p className="text-center text-[13.5px] leading-relaxed text-ink-muted">
        This link is missing its token. Request a new one from the{' '}
        <Link href="/auth/forgot-password" className="font-semibold text-brand-bright hover:underline">
          reset page
        </Link>
        .
      </p>
    );
  }

  if (state === 'done') {
    return (
      <div className="text-center">
        <h2 className="text-[15px] font-bold text-ink">Password updated</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          All other sessions have been signed out. Redirecting you to sign in…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="New password">
        <input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Confirm password" error={confirm && !matches ? 'Passwords do not match' : undefined}>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </Field>

      <ul className="grid grid-cols-2 gap-1.5">
        {RULES.map((rule, index) => (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-1.5 text-[11.5px]',
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

      <button type="submit" disabled={state === 'saving' || !canSubmit} className={buttonClass}>
        {state === 'saving' ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Set a new password" subtitle="Choose something you have not used here before.">
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" />}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
