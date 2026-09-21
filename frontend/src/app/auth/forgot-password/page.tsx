'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AuthShell, buttonClass, Field, inputClass } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';

type Step = 'email' | 'code' | 'password' | 'done';

/** Matches the server: a code lives ten minutes. */
const RESEND_COOLDOWN_S = 60;

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  // Countdown for the resend link.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Move focus to whatever the step now asks for.
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
    if (step === 'password') passwordRef.current?.focus();
  }, [step]);

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: { email: email.trim().toLowerCase() } });
    } catch {
      // The endpoint never reveals whether the address exists, so the UI moves
      // on either way rather than leaking that distinction.
    }
    setBusy(false);
    setCooldown(RESEND_COOLDOWN_S);
    setCode('');
    setStep('code');
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/verify-reset-code', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), code },
      });
      setStep('password');
    } catch (err) {
      setError(messageOf(err, 'That code is invalid or has expired.'));
    } finally {
      setBusy(false);
    }
  };

  const setNewPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), code, password },
      });
      setStep('done');
    } catch (err) {
      setError(messageOf(err, 'Could not update your password. Request a new code and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const copy: Record<Step, { title: string; subtitle: string }> = {
    email: {
      title: 'Reset your password',
      subtitle: 'Enter your email address and we will send you a 6-digit code.',
    },
    code: {
      title: 'Check your email',
      subtitle: `If an account exists for ${email.trim() || 'that address'}, a 6-digit code is on its way. It expires in 10 minutes.`,
    },
    password: { title: 'Choose a new password', subtitle: 'Pick something you have not used here before.' },
    done: { title: 'Password updated', subtitle: 'You can now sign in with your new password.' },
  };

  return (
    <AuthShell
      title={copy[step].title}
      subtitle={copy[step].subtitle}
      footer={
        <Link href="/auth/login" className="font-semibold text-brand-bright hover:underline">
          Back to sign in
        </Link>
      }
    >
      <StepDots step={step} />

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger"
        >
          {error}
        </p>
      ) : null}

      {step === 'email' ? (
        <form onSubmit={requestCode} className="space-y-4" noValidate>
          <Field label="Email address">
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </Field>
          <button type="submit" disabled={busy || !email.trim()} className={buttonClass}>
            {busy ? 'Sending code…' : 'Send code'}
          </button>
        </form>
      ) : null}

      {step === 'code' ? (
        <form onSubmit={verifyCode} className="space-y-4" noValidate>
          <Field label="6-digit code" hint="Check your spam folder if it has not arrived.">
            <input
              ref={codeRef}
              type="text"
              name="code"
              // Lets browsers and password managers offer the emailed code.
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              aria-describedby="code-help"
              className={cn(inputClass, 'text-center font-mono text-[22px] tracking-[0.6em]')}
            />
          </Field>

          <button type="submit" disabled={busy || code.length !== 6} className={buttonClass}>
            {busy ? 'Checking…' : 'Verify code'}
          </button>

          <p id="code-help" className="text-center text-[12.5px] text-ink-muted">
            {cooldown > 0 ? (
              <>Resend available in {cooldown}s</>
            ) : (
              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={busy}
                className="font-semibold text-brand-bright hover:underline disabled:opacity-50"
              >
                Send a new code
              </button>
            )}
            <span className="mx-2 text-ink-faint">·</span>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setError(null);
              }}
              className="text-ink-soft hover:underline"
            >
              Use a different email
            </button>
          </p>
        </form>
      ) : null}

      {step === 'password' ? (
        <form onSubmit={setNewPassword} className="space-y-4" noValidate>
          <Field label="New password" hint="At least 8 characters, with an uppercase letter and a number.">
            <div className="relative">
              <input
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                name="new-password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(inputClass, 'pr-20')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1 text-[12px] font-semibold text-ink-muted transition hover:bg-white/8 hover:text-ink"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          <button type="submit" disabled={busy || password.length < 8} className={buttonClass}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      ) : null}

      {step === 'done' ? (
        <div className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ok/15 text-ok" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="mt-4 text-[13.5px] text-ink-muted">
            For your security, every other device has been signed out.
          </p>
          <Link href="/auth/login" className={cn(buttonClass, 'mt-5 inline-flex justify-center')}>
            Go to sign in
          </Link>
        </div>
      ) : null}
    </AuthShell>
  );
}

/** Three dots showing progress through the reset, plus a label for screen readers. */
function StepDots({ step }: { step: Step }) {
  const order: Step[] = ['email', 'code', 'password'];
  const current = step === 'done' ? order.length : order.indexOf(step);
  return (
    <div className="mb-5 flex items-center justify-center gap-2" aria-label={`Step ${Math.min(current + 1, 3)} of 3`}>
      {order.map((name, i) => (
        <span
          key={name}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            i < current ? 'w-6 bg-brand-bright' : i === current ? 'w-6 bg-brand' : 'w-1.5 bg-white/20',
          )}
        />
      ))}
    </div>
  );
}
