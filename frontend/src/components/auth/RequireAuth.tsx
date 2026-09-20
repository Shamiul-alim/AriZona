'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import type { UserRole } from '@/lib/types';

const RANK: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

interface RequireAuthProps {
  children: React.ReactNode;
  /** Minimum role. Omit to require only that the viewer is signed in. */
  role?: UserRole;
}

/**
 * Client-side gate for account-only areas.
 *
 * This is a UX guard, not a security boundary — every protected endpoint is
 * independently authorised on the server, so a user who bypasses this gets an
 * empty screen and a 403, not data.
 */
export function RequireAuth({ children, role }: RequireAuthProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user } = useAuthStore();

  const authorised = status === 'authenticated' && (!role || (user && RANK[user.role] >= RANK[role]));

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/15 border-t-brand-bright" />
      </div>
    );
  }

  if (status === 'anonymous') {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <p className="text-[13.5px] text-ink-muted">Redirecting to sign in…</p>
      </div>
    );
  }

  if (!authorised) {
    return (
      <div className="grid min-h-[50vh] place-items-center px-4 text-center">
        <div>
          <h1 className="text-[1.3rem] font-bold text-ink">Not available to your account</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">
            This area needs {role?.toLowerCase().replace('_', ' ')} permissions.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
