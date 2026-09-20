'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';

export function RequestForm() {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');

  const [title, setTitle] = useState('');
  const [titleJapanese, setTitleJapanese] = useState('');
  const [malUrl, setMalUrl] = useState('');
  const [anilistUrl, setAnilistUrl] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 2) return;

    setState('sending');
    setError(null);
    try {
      const send = isAuthenticated ? authFetch : apiFetch;
      await send('/anime-requests', {
        method: 'POST',
        body: {
          title: title.trim(),
          titleJapanese: titleJapanese.trim() || undefined,
          malUrl: malUrl.trim() || undefined,
          anilistUrl: anilistUrl.trim() || undefined,
          message: message.trim() || undefined,
        },
      });
      setState('sent');
    } catch (e) {
      setState('idle');
      setError(e instanceof Error ? e.message : 'Could not submit your request.');
    }
  };

  if (state === 'sent') {
    return (
      <div className="card-surface p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ok/15">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-ok" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-3 text-[15px] font-bold text-ink">Request submitted</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          Thanks. It will appear in the queue once a moderator picks it up. If it goes live and you were signed in,
          you will earn Mana for it.
        </p>
        <button
          type="button"
          onClick={() => {
            setState('idle');
            setTitle('');
            setTitleJapanese('');
            setMalUrl('');
            setAnilistUrl('');
            setMessage('');
          }}
          className="mt-5 rounded-lg border border-line px-4 py-2.5 text-[13.5px] font-semibold text-ink-soft transition hover:bg-white/6"
        >
          Request another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-surface space-y-4 p-5">
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
          Anime title <span className="text-danger">*</span>
        </span>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 250))}
          placeholder="The title as you know it"
          className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Japanese title</span>
        <input
          type="text"
          value={titleJapanese}
          onChange={(e) => setTitleJapanese(e.target.value.slice(0, 250))}
          placeholder="Optional, but helps us identify it"
          className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">MyAnimeList link</span>
          <input
            type="url"
            value={malUrl}
            onChange={(e) => setMalUrl(e.target.value)}
            placeholder="https://…"
            className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">AniList link</span>
          <input
            type="url"
            value={anilistUrl}
            onChange={(e) => setAnilistUrl(e.target.value)}
            placeholder="https://…"
            className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
        </label>
      </div>

      <p className="rounded-lg bg-base px-3 py-2 text-[11.5px] leading-relaxed text-ink-faint">
        Links are stored for the moderator&rsquo;s reference only. The site never fetches data from those services.
      </p>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Anything else?</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
          rows={4}
          placeholder="Year, studio, how you heard about it — whatever helps us find the right title."
          className="w-full resize-y rounded-lg border border-line-soft bg-base px-3.5 py-2.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
        />
      </label>

      {!isAuthenticated ? (
        <p className="rounded-lg bg-brand/10 px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
          You can request without an account, but signing in lets you track the status and earn Mana if it goes live.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/12 px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === 'sending' || title.trim().length < 2}
        className="h-11 w-full rounded-lg bg-brand text-[14px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-60"
      >
        {state === 'sending' ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
