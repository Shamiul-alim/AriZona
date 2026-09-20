'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { postLoginPath } from '@/lib/auth-redirect';
import { AuthShell } from '@/components/auth/AuthShell';

/**
 * Landing point for the Google OAuth redirect.
 *
 * The backend has already set the httpOnly refresh cookie (no token is ever put
 * in the URL); refresh() trades that cookie for an in-memory session, then the
 * user is routed by their role.
 */
function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const refresh = useAuthStore((s) => s.refresh);

  useEffect(() => {
    void refresh().then((token) => {
      const user = useAuthStore.getState().user;
      if (!token || !user) {
        router.replace('/auth/login?error=Google%20sign-in%20did%20not%20complete.%20Please%20try%20again.');
        return;
      }
      router.replace(postLoginPath(user.role, params.get('next')));
      router.refresh();
    });
  }, [refresh, router, params]);

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/15 border-t-brand-bright" />
      <p className="text-[13.5px] text-ink-muted">Finishing sign-in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <AuthShell title="Signing you in" subtitle="One moment.">
      <Suspense fallback={<div className="skeleton h-24 rounded-lg" />}>
        <CallbackInner />
      </Suspense>
    </AuthShell>
  );
}
