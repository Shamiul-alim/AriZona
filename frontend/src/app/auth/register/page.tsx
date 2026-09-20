import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Create a free account to build your list, track progress and join the community.',
  robots: { index: false, follow: true },
};

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Track what you watch, build a list, and earn Mana in the community."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/auth/login" className="font-semibold text-brand-bright hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<div className="skeleton h-72 rounded-lg" />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
