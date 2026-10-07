'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * What a visitor sees when a page could not get its data.
 *
 * It exists so an outage stops impersonating an empty catalogue. Saying "no
 * titles found" when the request never completed sends people looking for
 * content that is there, and hides real failures from whoever has to debug
 * them.
 *
 * Nothing from the error reaches the page: `digest` is the hash Next puts in the
 * server log, so a report can be matched to a log line without putting a stack
 * trace, a query or a connection string in front of a visitor.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The browser console gets the same hash and nothing more.
    console.error('Page failed to load', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-4">
      <div className="text-center">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Something went wrong</p>
        <h1 className="mt-2 text-[1.5rem] font-extrabold text-ink md:text-[1.9rem]">
          We couldn’t load this page
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-muted">
          This is a problem on our side, not with what you were looking for. The catalogue is still there — the
          server just didn’t answer in time. Trying again usually works.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={reset}
            className="h-11 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition hover:bg-brand-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
          >
            Try again
          </button>
          <Link
            href="/"
            className="h-11 rounded-xl border border-line-soft bg-surface px-5 text-[14px] font-semibold leading-[2.75rem] text-ink transition hover:bg-surface-2"
          >
            Go to the home page
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 text-[11.5px] text-ink-faint">
            Reference <span className="font-mono text-ink-soft">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
