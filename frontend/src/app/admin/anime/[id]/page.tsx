import { AnimeForm } from '@/components/admin/AnimeForm';

export default async function EditAnimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnimeForm animeId={id} />;
}
