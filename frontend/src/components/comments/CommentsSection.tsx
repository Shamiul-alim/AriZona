'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { CommentNode, Paginated } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';

type Sort = 'newest' | 'oldest' | 'top';

interface CommentsSectionProps {
  animeSlug?: string;
  episodeId?: string;
  title?: string;
}

const MAX_LENGTH = 2000;

export function CommentsSection({ animeSlug, episodeId, title = 'Comments' }: CommentsSectionProps) {
  const router = useRouter();
  const { user, status } = useAuthStore();

  const [comments, setComments] = useState<CommentNode[]>([]);
  const [meta, setMeta] = useState<Paginated<CommentNode>['meta'] | null>(null);
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const scope = qs({ animeSlug, episodeId, sort, page, limit: 20 });

  const load = useCallback(
    async (append = false) => {
      setLoading(true);
      try {
        const fetcher = status === 'authenticated' ? authFetch<Paginated<CommentNode>> : apiFetch<Paginated<CommentNode>>;
        const result = await fetcher(`/comments${scope}`);
        setComments((previous) => (append ? [...previous, ...result.data] : result.data));
        setMeta(result.meta);
      } catch {
        if (!append) setComments([]);
      } finally {
        setLoading(false);
      }
    },
    [scope, status],
  );

  useEffect(() => {
    void load(page > 1);
    // `scope` already encodes sort/page/target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const requireAuth = (): boolean => {
    if (status !== 'authenticated') {
      const next = animeSlug ? `/anime/${animeSlug}` : '/';
      router.push(`/auth/login?next=${encodeURIComponent(next)}`);
      return false;
    }
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireAuth()) return;
    const text = body.trim();
    if (text.length < 2) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await authFetch<CommentNode>('/comments', {
        method: 'POST',
        body: { animeSlug, episodeId, body: text, isSpoiler },
      });
      setComments((previous) => [created, ...previous]);
      setBody('');
      setIsSpoiler(false);
      setMeta((m) => (m ? { ...m, total: m.total + 1 } : m));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post your comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async (parentId: string) => {
    if (!requireAuth()) return;
    const text = replyBody.trim();
    if (text.length < 2) return;

    setSubmitting(true);
    try {
      const created = await authFetch<CommentNode>('/comments', {
        method: 'POST',
        body: { animeSlug, episodeId, parentId, body: text },
      });
      setComments((previous) =>
        previous.map((c) =>
          c.id === parentId ? { ...c, replies: [...c.replies, created], replyCount: c.replyCount + 1 } : c,
        ),
      );
      setReplyBody('');
      setReplyTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post your reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (comment: CommentNode, direction: 1 | -1) => {
    if (!requireAuth()) return;
    try {
      const result = await authFetch<{ upvoteCount: number; downvoteCount: number; myVote: number | null }>(
        `/comments/${comment.id}/${direction === 1 ? 'upvote' : 'downvote'}`,
        { method: 'POST' },
      );
      const apply = (node: CommentNode): CommentNode =>
        node.id === comment.id
          ? { ...node, ...result }
          : { ...node, replies: node.replies.map(apply) };
      setComments((previous) => previous.map(apply));
    } catch {
      // A failed vote leaves the previous count in place.
    }
  };

  const remove = async (comment: CommentNode) => {
    if (!requireAuth()) return;
    try {
      await authFetch(`/comments/${comment.id}`, { method: 'DELETE' });
      const apply = (node: CommentNode): CommentNode =>
        node.id === comment.id
          ? { ...node, isDeleted: true, body: null, author: null }
          : { ...node, replies: node.replies.map(apply) };
      setComments((previous) => previous.map(apply));
    } catch {
      setError('Could not delete that comment.');
    }
  };

  const toggleSpoiler = (id: string) => {
    setRevealed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderComment = (comment: CommentNode, depth = 0) => {
    const canModerate = user && (user.id === comment.author?.id || user.role !== 'USER');
    const hidden = comment.isSpoiler && !revealed.has(comment.id);

    return (
      <article key={comment.id} className={cn(depth > 0 && 'ml-5 border-l border-line-soft pl-4 md:ml-8')}>
        <div className="flex gap-3 py-3">
          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-2">
            {comment.author?.avatarUrl ? (
              <Image src={comment.author.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
            ) : null}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {comment.author ? (
                <Link
                  href={`/user/${comment.author.username}`}
                  className="text-[13px] font-semibold text-ink transition hover:text-brand-bright"
                >
                  {comment.author.displayName ?? comment.author.username}
                </Link>
              ) : (
                <span className="text-[13px] font-semibold text-ink-faint">[removed]</span>
              )}

              {comment.author?.rank ? (
                <span
                  className="rounded px-1.5 py-px text-[10px] font-bold"
                  style={{
                    background: `${comment.author.rank.color ?? '#7c5cff'}22`,
                    color: comment.author.rank.color ?? '#7c5cff',
                  }}
                >
                  {comment.author.rank.icon} {comment.author.rank.name}
                </span>
              ) : null}

              {comment.author && comment.author.role !== 'USER' ? (
                <span className="rounded bg-brand/20 px-1.5 py-px text-[10px] font-bold uppercase text-brand-bright">
                  {comment.author.role === 'MODERATOR' ? 'Mod' : 'Staff'}
                </span>
              ) : null}

              <span className="text-[11px] text-ink-faint">
                {formatRelativeTime(comment.createdAt)}
                {comment.isEdited ? ' · edited' : ''}
              </span>
            </div>

            {comment.isDeleted ? (
              <p className="mt-1 text-[13px] italic text-ink-faint">This comment was removed.</p>
            ) : hidden ? (
              <button
                type="button"
                onClick={() => toggleSpoiler(comment.id)}
                className="mt-1.5 w-full rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-left text-[12.5px] font-medium text-warn transition hover:bg-warn/15"
              >
                Spoiler — click to reveal
              </button>
            ) : (
              <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink-soft">
                {comment.body}
              </p>
            )}

            {!comment.isDeleted ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <VoteButton
                  active={comment.myVote === 1}
                  onClick={() => void vote(comment, 1)}
                  count={comment.upvoteCount}
                  direction="up"
                />
                <VoteButton
                  active={comment.myVote === -1}
                  onClick={() => void vote(comment, -1)}
                  count={comment.downvoteCount}
                  direction="down"
                />

                {depth === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!requireAuth()) return;
                      setReplyTo(replyTo === comment.id ? null : comment.id);
                      setReplyBody('');
                    }}
                    className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-muted transition hover:bg-white/6 hover:text-ink"
                  >
                    Reply
                  </button>
                ) : null}

                {canModerate ? (
                  <button
                    type="button"
                    onClick={() => void remove(comment)}
                    className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-faint transition hover:bg-white/6 hover:text-danger"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}

            {replyTo === comment.id ? (
              <div className="mt-2.5">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value.slice(0, MAX_LENGTH))}
                  rows={2}
                  placeholder={`Reply to ${comment.author?.username ?? 'this comment'}…`}
                  className="w-full resize-y rounded-lg border border-line-soft bg-base px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
                />
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    disabled={submitting || replyBody.trim().length < 2}
                    onClick={() => void submitReply(comment.id)}
                    className="rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-50"
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-muted transition hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {comment.replies.length > 0 ? (
          <div className="border-t border-line-soft/60">{comment.replies.map((reply) => renderComment(reply, depth + 1))}</div>
        ) : null}
      </article>
    );
  };

  return (
    <section id="comments">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[1.15rem] font-bold text-ink">
          <span className="inline-block h-5 w-1 rounded-full bg-gradient-to-b from-brand-bright to-accent" />
          {title}
          {meta ? <span className="text-[13px] font-normal text-ink-faint">({meta.total})</span> : null}
        </h2>

        <div className="flex gap-1 rounded-xl bg-surface p-1 ring-1 ring-line-soft">
          {(['newest', 'top', 'oldest'] as Sort[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSort(option);
                setPage(1);
              }}
              className={
                sort === option
                  ? 'rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white'
                  : 'rounded-lg px-3 py-1.5 text-[12.5px] text-ink-muted transition hover:text-ink'
              }
            >
              {option === 'newest' ? 'Newest' : option === 'top' ? 'Top' : 'Oldest'}
            </button>
          ))}
        </div>
      </div>

      {status === 'authenticated' ? (
        <form onSubmit={submit} className="card-surface p-3.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_LENGTH))}
            rows={3}
            placeholder="Share your thoughts. Tag spoilers."
            className="w-full resize-y rounded-lg border border-line-soft bg-base px-3 py-2.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-muted">
              <input
                type="checkbox"
                checked={isSpoiler}
                onChange={(e) => setIsSpoiler(e.target.checked)}
                className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
              />
              Mark as spoiler
            </label>
            <div className="flex items-center gap-3">
              <span className="text-[11.5px] tabular-nums text-ink-faint">
                {body.length}/{MAX_LENGTH}
              </span>
              <button
                type="submit"
                disabled={submitting || body.trim().length < 2}
                className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-50"
              >
                {submitting ? 'Posting…' : 'Post comment'}
              </button>
            </div>
          </div>
          {error ? <p className="mt-2 text-[12.5px] text-danger">{error}</p> : null}
        </form>
      ) : (
        <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[13.5px] text-ink-muted">Sign in to join the conversation.</p>
          <Link
            href="/auth/login"
            className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-bright"
          >
            Sign in
          </Link>
        </div>
      )}

      <div className="mt-4 divide-y divide-line-soft">
        {loading && comments.length === 0 ? (
          Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton my-3 h-20 rounded-xl" />)
        ) : comments.length === 0 ? (
          <p className="py-10 text-center text-[13.5px] text-ink-faint">
            No comments yet. Be the first to say something.
          </p>
        ) : (
          comments.map((comment) => renderComment(comment))
        )}
      </div>

      {meta?.hasNext ? (
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={loading}
          className="mt-4 w-full rounded-xl border border-line-soft bg-surface py-2.5 text-[13px] font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more comments'}
        </button>
      ) : null}
    </section>
  );
}

function VoteButton({
  active,
  onClick,
  count,
  direction,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  direction: 'up' | 'down';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={direction === 'up' ? 'Upvote' : 'Downvote'}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition hover:bg-white/6',
        active ? (direction === 'up' ? 'text-accent' : 'text-danger') : 'text-ink-muted hover:text-ink',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className={cn('h-3.5 w-3.5', direction === 'down' && 'rotate-180')}
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M12 5 4.5 14h15L12 5Z" strokeLinejoin="round" />
      </svg>
      {count > 0 ? count : ''}
    </button>
  );
}
