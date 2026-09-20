'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AuthShell, buttonClass, Field, inputClass } from '@/components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: { email: email.trim().toLowerCase() } });
    } catch {
      // The endpoint deliberately never reveals whether the address exists,
      // so the UI shows the same confirmation either way.
    }
    setState('sent');
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email address and we will send you a link to set a new password."
      footer={
        <Link href="/auth/login" className="font-semibold text-brand-bright hover:underline">
          Back to sign in
        </Link>
      }
    >
      {state === 'sent' ? (
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ok/15">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-ok" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M3 7.5 12 13l9-5.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="3" y="5" width="18" height="14" rx="2.2" />
            </svg>
          </div>
          <h2 className="mt-3 text-[15px] font-bold text-ink">Check your inbox</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            If an account exists for <span className="text-ink">{email}</span>, a reset link is on its way. It expires
            in one hour.
          </p>
        </div>
      ) : (
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
          <button type="submit" disabled={state === 'sending'} className={buttonClass}>
            {state === 'sending' ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
