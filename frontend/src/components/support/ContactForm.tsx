'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const CATEGORIES = [
  { value: 'GENERAL', label: 'General enquiry' },
  { value: 'TECHNICAL', label: 'Technical problem' },
  { value: 'ACCOUNT', label: 'Account issue' },
  { value: 'ADVERTISING', label: 'Advertising' },
  { value: 'DMCA', label: 'Content notice / DMCA' },
  { value: 'FEEDBACK', label: 'Feedback' },
  { value: 'OTHER', label: 'Something else' },
];

export function ContactForm() {
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState(user?.displayName ?? user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setError(null);
    try {
      await apiFetch('/contact', {
        method: 'POST',
        body: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          subject: subject.trim(),
          category,
          message: message.trim(),
        },
      });
      setState('sent');
    } catch (e) {
      setState('idle');
      setError(e instanceof Error ? e.message : 'Could not send your message.');
    }
  };

  if (state === 'sent') {
    return (
      <div className="card-surface p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ok/15">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-ok" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M3 7.5 12 13l9-5.5" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="3" y="5" width="18" height="14" rx="2.2" />
          </svg>
        </div>
        <h2 className="mt-3 text-[15px] font-bold text-ink">Message received</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          Thanks for getting in touch. We usually reply within a few days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-surface space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
            Your name <span className="text-danger">*</span>
          </span>
          <input
            type="text"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 120))}
            className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none transition focus:border-brand/60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
            Email <span className="text-danger">*</span>
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-11 w-full rounded-lg border border-line-soft bg-base px-3 text-[14px] text-ink outline-none focus:border-brand/60"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
          Subject <span className="text-danger">*</span>
        </span>
        <input
          type="text"
          required
          minLength={3}
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, 200))}
          placeholder="A one-line summary"
          className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
          Message <span className="text-danger">*</span>
        </span>
        <textarea
          required
          minLength={10}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 5000))}
          rows={7}
          placeholder="The more detail you give, the faster we can help."
          className="w-full resize-y rounded-lg border border-line-soft bg-base px-3.5 py-2.5 text-[14px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
        />
        <span className="mt-1 block text-right text-[11px] tabular-nums text-ink-faint">{message.length}/5000</span>
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/12 px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === 'sending'}
        className="h-11 w-full rounded-lg bg-brand text-[14px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
