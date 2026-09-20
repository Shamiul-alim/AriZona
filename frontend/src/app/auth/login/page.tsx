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
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
