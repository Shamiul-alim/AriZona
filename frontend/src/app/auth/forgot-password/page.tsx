'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AuthShell, buttonClass, Field, inputClass } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';

/**
 * Password recovery, in the shape people expect from a consumer site:
 *
 *   find → send → code → password → done
 *
 * WHY "FIND YOUR ACCOUNT" DOES NOT LOOK ANYTHING UP
 * -------------------------------------------------
 * A screen that answers "account found" / "no such account" is an enumeration
 * oracle: anyone could test addresses at will. So the first step never contacts
 * the server at all — it only checks that what was typed *looks* like an email
 * and hands it to the next screen. The confirmation screen then states the
 * privacy-preserving truth ("if an account exists, we'll send a code") and only
 * on "Send verification code" is the server told anything. That request always
 * answers 202, for every address. The flow feels like a lookup; nothing is
 * actually revealed.
 */

type Step = 'find' | 'send' | 'code' | 'password' | 'done';

/** Matches the server: a code lives ten minutes. */
const RESEND_COOLDOWN_S = 60;
const ORDER: Step[] = ['find', 'send', 'code', 'password'];

/** Deliberately permissive — the server is the authority, this only catches typos. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Shows enough of the address to recognise it, not enough to harvest it. */
function maskEmail(raw: string): string {
  const value = raw.trim();
  const at = value.lastIndexOf('@');
  if (at < 1) return value;
  const name = value.slice(0, at);
  const domain = value.slice(at);
  if (name.length <= 2) return `${name[0]}***${domain}`;
  return `${name.slice(0, 2)}${'*'.repeat(Math.min(name.length - 2, 6))}${domain}`;
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('find');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const sendRef = useRef<HTMLButtonElement | null>(null);

  const normalised = email.trim().toLowerCase();

  // Countdown for the resend link.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Move focus to whatever the step now asks for.
  useEffect(() => {
    if (step === 'send') sendRef.current?.focus();
    if (step === 'code') codeRef.current?.focus();
    if (step === 'password') passwordRef.current?.focus();
  }, [step]);

  /** Step 1. Local validation only — nothing leaves the browser. */
  const findAccount = (event: React.FormEvent) => {
    event.preventDefault();
    if (!EMAIL_SHAPE.test(normalised)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setStep('send');
  };

  /** Step 2. The first and only request that mentions the address. */
  const sendCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: { email: normalised } });
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
      await apiFetch('/auth/verify-reset-code', { method: 'POST', body: { email: normalised, code } });
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
      await apiFetch('/auth/reset-password', { method: 'POST', body: { email: normalised, code, password } });
      setStep('done');
    } catch (err) {
      setError(messageOf(err, 'Could not update your password. Request a new code and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const copy: Record<Step, { title: string; subtitle: string }> = {
    find: {
      title: 'Find your account',
      subtitle: 'Enter the email address you use for AniZora.',
    },
    send: {
      title: 'Send a verification code',
      subtitle: `If an AniZora account exists for ${maskEmail(normalised)}, we'll send it a 6-digit code.`,
    },
    code: {
      title: 'Enter your code',
      subtitle: `If an account exists for ${maskEmail(normalised)}, a 6-digit code is on its way. It expires in 10 minutes.`,
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

      {step === 'find' ? (
        <form onSubmit={findAccount} className="space-y-4" noValidate>
          <Field label="Email address">
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="you@example.com"
              className={inputClass}
            />
          </Field>
          <button type="submit" disabled={!email.trim()} className={buttonClass}>
            Continue
          </button>
        </form>
      ) : null}

      {step === 'send' ? (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <div className="rounded-xl border border-line-soft bg-surface/50 px-4 py-3.5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Sending to</p>
            <p className="mt-1 break-all font-mono text-[14px] text-ink">{maskEmail(normalised)}</p>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            For your privacy we don&apos;t confirm whether an account exists. If one does, the code will arrive within a
            minute or two.
          </p>
          <button ref={sendRef} type="submit" disabled={busy} className={buttonClass}>
            {busy ? 'Sending code…' : 'Send verification code'}
          </button>
          <p className="text-center text-[12.5px] text-ink-muted">
            <button
              type="button"
              onClick={() => {
                setStep('find');
                setError(null);
              }}
              className="text-ink-soft hover:underline"
            >
              Use a different email
            </button>
          </p>
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
                onClick={() => void sendCode()}
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
                setStep('find');
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
          <p className="mt-4 text-[13.5px] text-ink-muted">For your security, every other device has been signed out.</p>
          <Link href="/auth/login" className={cn(buttonClass, 'mt-5 inline-flex justify-center')}>
            Go to sign in
          </Link>
        </div>
      ) : null}
    </AuthShell>
  );
}

/** Progress through the reset, plus a label for screen readers. */
function StepDots({ step }: { step: Step }) {
  const current = step === 'done' ? ORDER.length : ORDER.indexOf(step);
  return (
    <div
      className="mb-5 flex items-center justify-center gap-2"
      aria-label={`Step ${Math.min(current + 1, ORDER.length)} of ${ORDER.length}`}
    >
      {ORDER.map((name, i) => (
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
