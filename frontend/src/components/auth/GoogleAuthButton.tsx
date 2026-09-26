'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { PUBLIC_API_URL } from '@/lib/config';

/**
 * What we know about Google sign-in:
 *   checking — the request is in flight; the block is reserved but not usable
 *   on / off — the server answered
 *   unknown  — the request failed, so we never got an answer
 *
 * `off` is the only state that removes the block. A failed request is not an
 * answer, and retracting the button because the API was cold would be a layout
 * shift at the exact moment the backend is slowest to respond.
 */
type Providers = 'checking' | 'on' | 'off' | 'unknown';

/**
 * The answer, remembered for the tab: it cannot change between two visits to
 * /auth/login, so asking once keeps the second visit shift-free and saves a
 * round trip. A failure is deliberately not cached — the next page may
 * succeed.
 */
let cached: Providers = 'checking';

/**
 * "Continue with Google", together with the provider check that decides
 * whether it exists at all.
 *
 * That check is a network round trip. Until it answers the block still takes
 * up its full height — hidden, not absent — because otherwise the card grows
 * under the cursor the moment the answer lands, and the submit button moves
 * out from under a finger already on its way down.
 */
export function GoogleAuthButton({ label }: { label: string }) {
  const [state, setState] = useState<Providers>(cached);

  useEffect(() => {
    if (cached !== 'checking') return;
    let active = true;
    apiFetch<{ google: boolean }>('/auth/providers')
      .then((res) => {
        cached = res.google ? 'on' : 'off';
        if (active) setState(cached);
      })
      .catch(() => {
        if (active) setState('unknown');
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === 'off') return null;
  const pending = state === 'checking';

  return (
    <div
      className={pending ? 'invisible space-y-4' : 'space-y-4'}
      aria-hidden={pending || undefined}
      inert={pending || undefined}
    >
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-line-soft" />
        <span className="text-[11.5px] uppercase tracking-wider text-ink-faint">or</span>
        <span className="h-px flex-1 bg-line-soft" />
      </div>
      <a
        href={`${PUBLIC_API_URL}/auth/google`}
        rel="nofollow"
        tabIndex={pending ? -1 : undefined}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface-2 text-[14px] font-semibold text-ink transition hover:bg-surface-3"
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.17a5.28 5.28 0 0 1-2.29 3.46v2.88h3.7c2.17-2 3.42-4.94 3.42-8.53Z"
          />
          <path
            fill="#34A853"
            d="M12 23.5c3.1 0 5.7-1.03 7.58-2.78l-3.7-2.88c-1.03.69-2.35 1.09-3.88 1.09-2.98 0-5.5-2.01-6.4-4.72H1.77v2.97A11.48 11.48 0 0 0 12 23.5Z"
          />
          <path
            fill="#FBBC05"
            d="M5.6 14.21a6.9 6.9 0 0 1 0-4.41V6.83H1.77a11.5 11.5 0 0 0 0 10.34l3.83-2.96Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.07c1.68 0 3.19.58 4.38 1.71l3.28-3.28C17.7 1.6 15.1.5 12 .5 7.53.5 3.67 3.07 1.77 6.83L5.6 9.8c.9-2.71 3.42-4.72 6.4-4.72Z"
          />
        </svg>
        {label}
      </a>
    </div>
  );
}
