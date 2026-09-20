'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { EpisodeForm } from '@/components/admin/EpisodeForm';

function NewEpisodeInner() {
  const params = useSearchParams();
  return <EpisodeForm presetAnimeId={params.get('animeId') ?? undefined} />;
}

export default function NewEpisodePage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
      <NewEpisodeInner />
    </Suspense>
  );
}
