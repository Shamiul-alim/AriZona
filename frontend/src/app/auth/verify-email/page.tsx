'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AuthShell } from '@/components/auth/AuthShell';

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'checking' | 'done' | 'failed'>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('failed');
      setMessage('This confirmation link is missing its token.');
      return;
    }

    apiFetch('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('done'))
      .catch((error: unknown) => {
        setState('failed');
        setMessage(error instanceof Error ? error.message : 'This link is invalid or has expired.');
      });
  }, [token]);

  if (state === 'checking') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/15 border-t-brand-bright" />
        <p className="text-[13.5px] text-ink-muted">Confirming your email…</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div
        className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${
          state === 'done' ? 'bg-ok/15' : 'bg-danger/15'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-6 w-6 ${state === 'done' ? 'text-ok' : 'text-danger'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
        >
          {state === 'done' ? (
            <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M12 7v6.5M12 17h.01" strokeLinecap="round" />
          )}
        </svg>
      </div>
      <h2 className="mt-3 text-[15px] font-bold text-ink">
        {state === 'done' ? 'Email confirmed' : 'Could not confirm'}
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
        {state === 'done' ? 'Your account is fully set up. Thanks for confirming.' : message}
      </p>
      <Link
        href={state === 'done' ? '/' : '/auth/login'}
        className="mt-5 inline-block rounded-lg bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-brand-bright"
      >
        {state === 'done' ? 'Start watching' : 'Back to sign in'}
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Email confirmation" subtitle="Finishing setting up your account.">
      <Suspense fallback={<div className="skeleton h-40 rounded-lg" />}>
        <VerifyInner />
      </Suspense>
    </AuthShell>
  );
}
