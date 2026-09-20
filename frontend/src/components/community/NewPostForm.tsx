'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { AnimeCard, CommunityCategory, CommunityPostKind, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';

const KINDS: Array<{ value: CommunityPostKind; label: string; hint: string }> = [
  { value: 'TEXT', label: 'Discussion', hint: 'A normal post.' },
  { value: 'POLL', label: 'Poll', hint: 'Ask a question with 2–12 options.' },
  { value: 'MATCHUP', label: 'Matchup', hint: 'Head-to-head. Exactly two options.' },
  { value: 'TIER_LIST', label: 'Tier list', hint: 'Rank titles from S to F.' },
  { value: 'RECOMMENDATION', label: 'Recommendation', hint: 'Suggest titles worth watching.' },
];

const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'] as const;

interface Selection {
  id: string;
  slug: string;
  title: string;
  posterUrl: string | null;
}

export function NewPostForm({ categories }: { categories: CommunityCategory[] }) {
  const router = useRouter();
  const { user, status } = useAuthStore();

  const [kind, setKind] = useState<CommunityPostKind>('TEXT');
  const [categorySlug, setCategorySlug] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [selected, setSelected] = useState<Selection[]>([]);
  const [tiers, setTiers] = useState<Record<string, (typeof TIERS)[number]>>({});
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AnimeCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/auth/login?next=/community/new');
  }, [status, router]);

  // Categories a normal member is allowed to post in.
  const postable = categories.filter((c) => !c.staffOnly || (user && user.role !== 'USER'));

  useEffect(() => {
    if (!categorySlug && postable.length > 0) setCategorySlug(postable[0].slug);
  }, [categorySlug, postable]);

  // Matchups are polls with exactly two options — enforce that in the UI too.
  useEffect(() => {
    if (kind === 'MATCHUP' && pollOptions.length !== 2) {
      setPollOptions((previous) => [previous[0] ?? '', previous[1] ?? '']);
    }
  }, [kind, pollOptions.length]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<Paginated<AnimeCard>>(`/anime${qs({ q: search.trim(), limit: 8 })}`)
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const addSelection = useCallback((anime: AnimeCard) => {
    setSelected((previous) =>
      previous.some((s) => s.id === anime.id)
        ? previous
        : [...previous, { id: anime.id, slug: anime.slug, title: anime.title, posterUrl: anime.posterUrl }],
    );
    setSearch('');
    setResults([]);
  }, []);

  const needsAnime = kind === 'RECOMMENDATION' || kind === 'TIER_LIST';
  const needsPoll = kind === 'POLL' || kind === 'MATCHUP';

  const validate = (): string | null => {
    if (!categorySlug) return 'Choose a category.';
    if (title.trim().length < 5) return 'Give your post a title of at least 5 characters.';
    if (body.trim().length < 5) return 'Write something in the body.';
    if (needsPoll) {
      if (pollQuestion.trim().length < 3) return 'Add a poll question.';
      const filled = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (kind === 'MATCHUP' && filled.length !== 2) return 'A matchup needs exactly two options.';
      if (filled.length < 2) return 'A poll needs at least two options.';
    }
    if (needsAnime && selected.length === 0) {
      return kind === 'TIER_LIST' ? 'Add at least one title to rank.' : 'Add at least one title to recommend.';
    }
    return null;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        categorySlug,
        title: title.trim(),
        body: body.trim(),
        kind,
      };

      if (needsPoll) {
        payload.poll = {
          question: pollQuestion.trim(),
          allowMultiple: kind === 'MATCHUP' ? false : allowMultiple,
          options: pollOptions
            .map((text, index) => ({ text: text.trim(), animeId: selected[index]?.id }))
            .filter((o) => o.text.length > 0),
        };
      }

      if (kind === 'TIER_LIST') {
        payload.tierList = selected.map((s) => ({
          tier: tiers[s.id] ?? 'B',
          label: s.title,
          animeId: s.id,
        }));
      }

      if (selected.length > 0 && kind !== 'TIER_LIST') {
        payload.animeIds = selected.map((s) => s.id);
      }

      const created = await authFetch<{ slug: string }>('/community/posts', { method: 'POST', body: payload });
      router.push(`/community/${created.slug}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish your post.');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading' || status === 'idle') {
    return <div className="skeleton h-96 rounded-xl" />;
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="card-surface p-4">
        <legend className="px-1 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Post type</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              aria-pressed={kind === option.value}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left transition',
                kind === option.value
                  ? 'border-brand/60 bg-brand/12'
                  : 'border-line-soft bg-surface hover:border-line hover:bg-surface-2',
              )}
            >
              <span className={cn('block text-[13.5px] font-semibold', kind === option.value ? 'text-ink' : 'text-ink-soft')}>
                {option.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-ink-faint">{option.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="card-surface space-y-4 p-4">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Category</span>
          <select
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            className="h-10 w-full rounded-lg border border-line-soft bg-base px-3 text-[13.5px] text-ink outline-none focus:border-brand/60"
          >
            {postable.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            placeholder="Say what the post is about"
            className="h-10 w-full rounded-lg border border-line-soft bg-base px-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
          <span className="mt-1 block text-right text-[11px] tabular-nums text-ink-faint">{title.length}/200</span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Body</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 20000))}
            rows={8}
            placeholder="Basic formatting is allowed: <b>, <i>, <ul>, <blockquote>, <a>…"
            className="w-full resize-y rounded-lg border border-line-soft bg-base px-3 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
          <span className="mt-1 block text-right text-[11px] tabular-nums text-ink-faint">{body.length}/20000</span>
        </label>
      </div>

      {needsPoll ? (
        <div className="card-surface space-y-4 p-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
            {kind === 'MATCHUP' ? 'Matchup' : 'Poll'}
          </h2>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Question</span>
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value.slice(0, 300))}
              placeholder={kind === 'MATCHUP' ? 'Which one wins?' : 'What do you want to ask?'}
              className="h-10 w-full rounded-lg border border-line-soft bg-base px-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
            />
          </label>

          <div className="space-y-2">
            {pollOptions.map((option, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={option}
                  onChange={(e) => {
                    const next = [...pollOptions];
                    next[index] = e.target.value.slice(0, 200);
                    setPollOptions(next);
                  }}
                  placeholder={`Option ${index + 1}`}
                  className="h-10 flex-1 rounded-lg border border-line-soft bg-base px-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
                />
                {kind === 'POLL' && pollOptions.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== index))}
                    aria-label={`Remove option ${index + 1}`}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-line-soft text-ink-muted transition hover:border-danger/50 hover:text-danger"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {kind === 'POLL' ? (
            <div className="flex flex-wrap items-center gap-4">
              {pollOptions.length < 12 ? (
                <button
                  type="button"
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  className="text-[13px] font-semibold text-brand-bright transition hover:text-brand"
                >
                  + Add option
                </button>
              ) : null}
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
                <input
                  type="checkbox"
                  checked={allowMultiple}
                  onChange={(e) => setAllowMultiple(e.target.checked)}
                  className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
                />
                Allow multiple choices
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card-surface space-y-3 p-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
          {kind === 'TIER_LIST' ? 'Titles to rank' : kind === 'RECOMMENDATION' ? 'Titles to recommend' : 'Link titles (optional)'}
        </h2>

        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the catalogue…"
            className="h-10 w-full rounded-lg border border-line-soft bg-base px-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
          {results.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-2xl">
              {results.map((anime) => (
                <li key={anime.id}>
                  <button
                    type="button"
                    onClick={() => addSelection(anime)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/6"
                  >
                    <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-surface-2">
                      {anime.posterUrl ? (
                        <Image src={anime.posterUrl} alt="" fill sizes="32px" className="object-cover" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{anime.title}</span>
                      <span className="block text-[11px] text-ink-faint">
                        {anime.type} · {anime.releaseYear ?? '—'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {selected.length > 0 ? (
          <ul className="space-y-2">
            {selected.map((item) => (
              <li key={item.id} className="flex items-center gap-2.5 rounded-lg bg-base px-2.5 py-2">
                <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-surface-2">
                  {item.posterUrl ? <Image src={item.posterUrl} alt="" fill sizes="32px" className="object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">{item.title}</span>

                {kind === 'TIER_LIST' ? (
                  <select
                    value={tiers[item.id] ?? 'B'}
                    onChange={(e) =>
                      setTiers((previous) => ({ ...previous, [item.id]: e.target.value as (typeof TIERS)[number] }))
                    }
                    aria-label={`Tier for ${item.title}`}
                    className="h-8 rounded-lg border border-line-soft bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-brand/60"
                  >
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  type="button"
                  onClick={() => setSelected(selected.filter((s) => s.id !== item.id))}
                  aria-label={`Remove ${item.title}`}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:text-danger"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-ink-faint">Nothing selected yet.</p>
        )}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/12 px-3.5 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-11 flex-1 rounded-xl border border-line px-4 text-[14px] font-semibold text-ink-soft transition hover:bg-white/6"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="h-11 flex-[2] rounded-xl bg-brand px-4 text-[14px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-60"
        >
          {busy ? 'Publishing…' : 'Publish post'}
        </button>
      </div>
    </form>
  );
}
