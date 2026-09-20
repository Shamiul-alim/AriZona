'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { CommunityComment, CommunityPostDetail, Paginated, PollData } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { AdSlot } from '@/components/ads/AdSlot';
import { ReportDialog } from '@/components/watch/ReportDialog';
import { PollWidget } from './PollWidget';
import { TierListView } from './TierListView';

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'F'] as const;

export function PostDetailClient({ initialPost }: { initialPost: CommunityPostDetail }) {
  const router = useRouter();
  const { user, status } = useAuthStore();

  const [post, setPost] = useState(initialPost);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [meta, setMeta] = useState<Paginated<CommunityComment>['meta'] | null>(null);
  const [page, setPage] = useState(1);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const loadComments = useCallback(
    async (target: number, append: boolean) => {
      try {
        const fetcher = status === 'authenticated' ? authFetch<Paginated<CommunityComment>> : apiFetch<Paginated<CommunityComment>>;
        const result = await fetcher(`/community/posts/${post.slug}/comments${qs({ page: target, limit: 20 })}`);
        setComments((previous) => (append ? [...previous, ...result.data] : result.data));
        setMeta(result.meta);
      } catch {
        if (!append) setComments([]);
      }
    },
    [post.slug, status],
  );

  useEffect(() => {
    void loadComments(page, page > 1);
  }, [loadComments, page]);

  const requireAuth = (): boolean => {
    if (status !== 'authenticated') {
      router.push(`/auth/login?next=/community/${post.slug}`);
      return false;
    }
    return true;
  };

  const votePost = async (value: 1 | -1) => {
    if (!requireAuth()) return;
    try {
      const result = await authFetch<{ upvoteCount: number; downvoteCount: number; myVote: number | null }>(
        `/community/posts/${post.slug}/vote`,
        { method: 'POST', body: { value } },
      );
      setPost((p) => ({ ...p, ...result }));
    } catch {
      /* leave counts as-is */
    }
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireAuth()) return;
    const text = body.trim();
    if (text.length < 2) return;

    setBusy(true);
    setError(null);
    try {
      const created = await authFetch<CommunityComment>(`/community/posts/${post.slug}/comments`, {
        method: 'POST',
        body: { body: text },
      });
      setComments((previous) => [...previous, created]);
      setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }));
      setBody('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post your comment.');
    } finally {
      setBusy(false);
    }
  };

  const submitReply = async (parentId: string) => {
    if (!requireAuth()) return;
    const text = replyBody.trim();
    if (text.length < 2) return;

    setBusy(true);
    try {
      const created = await authFetch<CommunityComment>(`/community/posts/${post.slug}/comments`, {
        method: 'POST',
        body: { body: text, parentId },
      });
      setComments((previous) =>
        previous.map((c) => (c.id === parentId ? { ...c, replies: [...c.replies, created] } : c)),
      );
      setReplyBody('');
      setReplyTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post your reply.');
    } finally {
      setBusy(false);
    }
  };

  const upvoteComment = async (id: string) => {
    if (!requireAuth()) return;
    try {
      const result = await authFetch<{ upvoted: boolean }>(`/community/comments/${id}/upvote`, { method: 'POST' });
      const apply = (c: CommunityComment): CommunityComment =>
        c.id === id
          ? { ...c, upvoteCount: c.upvoteCount + (result.upvoted ? 1 : -1), myVote: result.upvoted ? 1 : null }
          : { ...c, replies: c.replies.map(apply) };
      setComments((previous) => previous.map(apply));
    } catch {
      /* ignore */
    }
  };

  const deleteComment = async (id: string) => {
    if (!requireAuth()) return;
    try {
      await authFetch(`/community/comments/${id}`, { method: 'DELETE' });
      setComments((previous) =>
        previous
          .filter((c) => c.id !== id)
          .map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== id) })),
      );
      setPost((p) => ({ ...p, commentCount: Math.max(0, p.commentCount - 1) }));
    } catch {
      setError('Could not delete that comment.');
    }
  };

  const deletePost = async () => {
    if (!requireAuth()) return;
    try {
      await authFetch(`/community/posts/${post.slug}`, { method: 'DELETE' });
      router.push('/community');
      router.refresh();
    } catch {
      setError('Could not delete this post.');
    }
  };

  const canModerate = user && (user.id === post.author.id || user.role !== 'USER');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-faint" aria-label="Breadcrumb">
        <Link href="/community" className="transition hover:text-ink-soft">
          Community
        </Link>
        <span>/</span>
        <Link href={`/community?category=${post.category.slug}`} className="transition hover:text-ink-soft">
          {post.category.name}
        </Link>
      </nav>

      <article className="card-surface overflow-hidden">
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className="rounded px-1.5 py-0.5 font-bold uppercase tracking-wide"
              style={{
                background: `${post.category.color ?? '#7c5cff'}22`,
                color: post.category.color ?? '#7c5cff',
              }}
            >
              {post.category.icon} {post.category.name}
            </span>
            {post.isPinned ? <span className="rounded bg-gold/20 px-1.5 py-0.5 font-bold text-gold">Pinned</span> : null}
            {post.isLocked ? (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-ink-faint">Locked</span>
            ) : null}
          </div>

          <h1 className="mt-2.5 text-[clamp(1.3rem,3vw,1.85rem)] font-extrabold leading-tight text-ink">
            {post.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-faint">
            <Link href={`/user/${post.author.username}`} className="flex items-center gap-2 transition hover:text-ink">
              <span className="relative h-6 w-6 overflow-hidden rounded-full bg-surface-2">
                {post.author.avatarUrl ? (
                  <Image src={post.author.avatarUrl} alt="" fill sizes="24px" className="object-cover" />
                ) : null}
              </span>
              <span className="text-ink-muted">{post.author.displayName ?? post.author.username}</span>
            </Link>
            {post.author.rank ? (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  background: `${post.author.rank.color ?? '#7c5cff'}22`,
                  color: post.author.rank.color ?? '#7c5cff',
                }}
              >
                {post.author.rank.icon} {post.author.rank.name}
              </span>
            ) : null}
            <span>{formatRelativeTime(post.createdAt)}</span>
            {post.isEdited ? <span>· edited</span> : null}
            <span>· {post.viewCount} views</span>
          </div>

          <div
            className="prose-anizora mt-5 text-[14.5px] leading-relaxed text-ink-soft [&_a]:text-brand-bright [&_a:hover]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted [&_h3]:mt-4 [&_h3]:text-[1.05rem] [&_h3]:font-bold [&_h3]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3"
            // Sanitised server-side by sanitizeRichText before it was stored.
            dangerouslySetInnerHTML={{ __html: post.body }}
          />

          {post.poll ? (
            <div className="mt-6">
              <PollWidget
                poll={post.poll}
                onVoted={(updated: PollData) => setPost((p) => ({ ...p, poll: updated }))}
              />
            </div>
          ) : null}

          {post.tierList.length > 0 ? (
            <div className="mt-6">
              <TierListView items={post.tierList} order={TIER_ORDER} />
            </div>
          ) : null}

          {post.anime.length > 0 ? (
            <div className="mt-6">
              <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                Titles mentioned
              </h2>
              <div className="flex flex-wrap gap-2.5">
                {post.anime.map((anime) => (
                  <Link key={anime.id} href={`/anime/${anime.slug}`} className="group/a w-24">
                    <span className="relative block aspect-[2/3] overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line-soft transition group-hover/a:ring-brand/60">
                      {anime.posterUrl ? (
                        <Image src={anime.posterUrl} alt="" fill sizes="96px" className="object-cover" />
                      ) : null}
                    </span>
                    <span className="clamp-2 mt-1.5 block text-[11.5px] font-medium text-ink-soft transition group-hover/a:text-brand-bright">
                      {anime.titleEnglish}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3 md:px-6">
          <button
            type="button"
            onClick={() => void votePost(1)}
            aria-pressed={post.myVote === 1}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition',
              post.myVote === 1 ? 'bg-accent/20 text-accent' : 'bg-surface-2 text-ink-muted hover:text-ink',
            )}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill={post.myVote === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path d="M12 5 4.5 14h15L12 5Z" strokeLinejoin="round" />
            </svg>
            {post.upvoteCount}
          </button>

          <button
            type="button"
            onClick={() => void votePost(-1)}
            aria-pressed={post.myVote === -1}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition',
              post.myVote === -1 ? 'bg-danger/20 text-danger' : 'bg-surface-2 text-ink-muted hover:text-ink',
            )}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 rotate-180" fill={post.myVote === -1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path d="M12 5 4.5 14h15L12 5Z" strokeLinejoin="round" />
            </svg>
            {post.downvoteCount}
          </button>

          <span className="text-[13px] text-ink-faint">{post.commentCount} comments</span>

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-muted transition hover:text-danger"
            >
              Report
            </button>
            {canModerate ? (
              <button
                type="button"
                onClick={() => void deletePost()}
                className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-muted transition hover:text-danger"
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </article>

      <AdSlot placementKey="community_list" format="leaderboard" className="my-6" />

      <section className="mt-6">
        <h2 className="mb-3 text-[1.05rem] font-bold text-ink">Comments ({post.commentCount})</h2>

        {post.isLocked ? (
          <p className="card-surface px-4 py-4 text-center text-[13px] text-ink-muted">
            This discussion is locked. No new comments can be added.
          </p>
        ) : status === 'authenticated' ? (
          <form onSubmit={submitComment} className="card-surface p-3.5">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 5000))}
              rows={3}
              placeholder="Add to the conversation…"
              className="w-full resize-y rounded-lg border border-line-soft bg-base px-3 py-2.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
            />
            <div className="mt-2 flex items-center justify-end gap-3">
              <span className="text-[11.5px] tabular-nums text-ink-faint">{body.length}/5000</span>
              <button
                type="submit"
                disabled={busy || body.trim().length < 2}
                className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-50"
              >
                {busy ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </form>
        ) : (
          <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-[13.5px] text-ink-muted">Sign in to join the conversation.</p>
            <Link
              href={`/auth/login?next=/community/${post.slug}`}
              className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-bright"
            >
              Sign in
            </Link>
          </div>
        )}

        {error ? <p className="mt-2 text-[12.5px] text-danger">{error}</p> : null}

        <div className="mt-4 space-y-3">
          {comments.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-ink-faint">No comments yet.</p>
          ) : (
            comments.map((comment) => (
              <CommentBlock
                key={comment.id}
                comment={comment}
                canDelete={Boolean(user && (user.id === comment.author.id || user.role !== 'USER'))}
                onUpvote={upvoteComment}
                onDelete={deleteComment}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                replyBody={replyBody}
                setReplyBody={setReplyBody}
                onSubmitReply={submitReply}
                busy={busy}
                locked={post.isLocked}
                currentUserId={user?.id}
              />
            ))
          )}
        </div>

        {meta?.hasNext ? (
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="mt-4 w-full rounded-xl border border-line-soft bg-surface py-2.5 text-[13px] font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          >
            Load more comments
          </button>
        ) : null}
      </section>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="COMMUNITY_POST"
        targetId={post.id}
      />
    </div>
  );
}

interface CommentBlockProps {
  comment: CommunityComment;
  canDelete: boolean;
  onUpvote: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  replyTo: string | null;
  setReplyTo: (id: string | null) => void;
  replyBody: string;
  setReplyBody: (value: string) => void;
  onSubmitReply: (parentId: string) => Promise<void>;
  busy: boolean;
  locked: boolean;
  currentUserId?: string;
  depth?: number;
}

function CommentBlock({
  comment,
  canDelete,
  onUpvote,
  onDelete,
  replyTo,
  setReplyTo,
  replyBody,
  setReplyBody,
  onSubmitReply,
  busy,
  locked,
  currentUserId,
  depth = 0,
}: CommentBlockProps) {
  return (
    <div className={cn('card-surface p-3.5', depth > 0 && 'ml-6 border-l-2 border-brand/25 md:ml-10')}>
      <div className="flex gap-3">
        <Link href={`/user/${comment.author.username}`} className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-2">
          {comment.author.avatarUrl ? (
            <Image src={comment.author.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
          ) : null}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link
              href={`/user/${comment.author.username}`}
              className="text-[13px] font-semibold text-ink transition hover:text-brand-bright"
            >
              {comment.author.displayName ?? comment.author.username}
            </Link>
            {comment.author.rank ? (
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
            <span className="text-[11px] text-ink-faint">
              {formatRelativeTime(comment.createdAt)}
              {comment.isEdited ? ' · edited' : ''}
            </span>
          </div>

          <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink-soft">
            {comment.body}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => void onUpvote(comment.id)}
              aria-pressed={comment.myVote === 1}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition hover:bg-white/6',
                comment.myVote === 1 ? 'text-accent' : 'text-ink-muted hover:text-ink',
              )}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={comment.myVote === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                <path d="M12 5 4.5 14h15L12 5Z" strokeLinejoin="round" />
              </svg>
              {comment.upvoteCount > 0 ? comment.upvoteCount : ''}
            </button>

            {depth === 0 && !locked ? (
              <button
                type="button"
                onClick={() => {
                  setReplyTo(replyTo === comment.id ? null : comment.id);
                  setReplyBody('');
                }}
                className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-muted transition hover:bg-white/6 hover:text-ink"
              >
                Reply
              </button>
            ) : null}

            {canDelete ? (
              <button
                type="button"
                onClick={() => void onDelete(comment.id)}
                className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-faint transition hover:bg-white/6 hover:text-danger"
              >
                Delete
              </button>
            ) : null}
          </div>

          {replyTo === comment.id ? (
            <div className="mt-2.5">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value.slice(0, 5000))}
                rows={2}
                placeholder={`Reply to ${comment.author.username}…`}
                className="w-full resize-y rounded-lg border border-line-soft bg-base px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  disabled={busy || replyBody.trim().length < 2}
                  onClick={() => void onSubmitReply(comment.id)}
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
        <div className="mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentBlock
              key={reply.id}
              comment={reply}
              canDelete={Boolean(currentUserId && currentUserId === reply.author.id)}
              onUpvote={onUpvote}
              onDelete={onDelete}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              replyBody={replyBody}
              setReplyBody={setReplyBody}
              onSubmitReply={onSubmitReply}
              busy={busy}
              locked={locked}
              currentUserId={currentUserId}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
