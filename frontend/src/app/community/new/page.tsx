import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import type { CommunityCategory } from '@/lib/types';
import { NewPostForm } from '@/components/community/NewPostForm';

export const metadata: Metadata = {
  title: 'New post',
  description: 'Start a discussion, poll, tier list, matchup or recommendation.',
  robots: { index: false, follow: true },
};

export default async function NewPostPage() {
  const categories = await apiFetch<CommunityCategory[]>('/community/categories', { revalidate: 300 }).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <h1 className="text-[1.6rem] font-extrabold text-ink md:text-[1.9rem]">Create a post</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          Tag spoilers, keep it civil, and pick the category that fits. Posting earns Mana.
        </p>
      </header>

      <NewPostForm categories={categories} />
    </div>
  );
}
