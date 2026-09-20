import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetchOrNull } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import type { CommunityPostDetail } from '@/lib/types';
import { PostDetailClient } from '@/components/community/PostDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await apiFetchOrNull<CommunityPostDetail>(`/community/posts/${slug}`);
  if (!post) return { title: 'Post not found' };

  const description = post.body.replace(/<[^>]+>/g, '').slice(0, 200);

  return {
    title: post.title,
    description,
    alternates: { canonical: `/community/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      url: `${SITE_URL}/community/${post.slug}`,
      publishedTime: post.createdAt,
      authors: [post.author.displayName ?? post.author.username],
    },
  };
}

export default async function CommunityPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await apiFetchOrNull<CommunityPostDetail>(`/community/posts/${slug}`);
  if (!post) notFound();

  return <PostDetailClient initialPost={post} />;
}
