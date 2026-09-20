import { EpisodeForm } from '@/components/admin/EpisodeForm';

export default async function EditEpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EpisodeForm episodeId={id} />;
}
