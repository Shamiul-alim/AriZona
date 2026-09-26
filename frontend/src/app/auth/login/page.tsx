import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to sync your list, history and community activity.',
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep your list, watch history and Mana in sync."
      footer={
        <>
          New here?{' '}
          <Link href="/auth/register" className="font-semibold text-brand-bright hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {/* The form needs useSearchParams, so it only appears at hydration. The
          fallback therefore has to be exactly as tall as the form's initial
          state (measured: 350px, identical at every width) — the column is
          vertically centered, so any mismatch moves the whole page, not just
          the card. Re-measure this if a field is added or removed. */}
      <Suspense fallback={<div className="skeleton h-[350px] rounded-lg" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
