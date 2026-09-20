import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AnimeCard as AnimeCardType } from '@/lib/types';
import { AnimeCard } from './AnimeCard';

function makeAnime(overrides: Partial<AnimeCardType> = {}): AnimeCardType {
  return {
    id: 'a1',
    slug: 'crimson-vanguard',
    title: 'Crimson Vanguard',
    titleEnglish: 'Crimson Vanguard',
    titleJapanese: 'クリムゾン・ヴァンガード',
    posterUrl: 'https://example.test/poster.svg',
    type: 'TV',
    status: 'ONGOING',
    score: 8.42,
    scoreCount: 120,
    releaseYear: 2026,
    season: 'FALL',
    totalEpisodes: 12,
    subCount: 12,
    dubCount: 6,
    durationMinutes: 24,
    ageRating: 'R_17',
    viewCount: 4500,
    genres: [{ name: 'Action', slug: 'action' }],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AnimeCard', () => {
  it('links to the anime detail page', () => {
    render(<AnimeCard anime={makeAnime()} />);

    const link = screen.getByRole('link', { name: 'Crimson Vanguard' });
    expect(link).toHaveAttribute('href', '/anime/crimson-vanguard');
  });

  it('shows the title and metadata line', () => {
    render(<AnimeCard anime={makeAnime()} />);

    expect(screen.getByRole('heading', { name: 'Crimson Vanguard' })).toBeInTheDocument();
    expect(screen.getByText(/2026 · TV · 24m/)).toBeInTheDocument();
  });

  it('shows the score to one decimal place', () => {
    render(<AnimeCard anime={makeAnime()} />);
    expect(screen.getByText('★ 8.4')).toBeInTheDocument();
  });

  it('hides the score badge when nothing has been rated yet', () => {
    render(<AnimeCard anime={makeAnime({ score: 0, scoreCount: 0 })} />);
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  it('shows SUB and DUB counts when both exist', () => {
    render(<AnimeCard anime={makeAnime()} />);
    expect(screen.getByText('SUB 12')).toBeInTheDocument();
    expect(screen.getByText('DUB 6')).toBeInTheDocument();
  });

  it('omits the DUB badge when there is no dub', () => {
    render(<AnimeCard anime={makeAnime({ dubCount: 0 })} />);
    expect(screen.getByText('SUB 12')).toBeInTheDocument();
    expect(screen.queryByText(/^DUB/)).not.toBeInTheDocument();
  });

  it('falls back to an episode badge when neither SUB nor DUB is counted', () => {
    render(<AnimeCard anime={makeAnime({ subCount: 0, dubCount: 0 })} />);
    expect(screen.getByText('EP 12')).toBeInTheDocument();
  });

  it('renders a placeholder instead of a broken image when artwork is missing', () => {
    render(<AnimeCard anime={makeAnime({ posterUrl: null })} />);
    expect(screen.getByText('No artwork')).toBeInTheDocument();
  });

  it('drops the metadata line in compact mode', () => {
    render(<AnimeCard anime={makeAnime()} detailed={false} />);
    expect(screen.getByRole('heading', { name: 'Crimson Vanguard' })).toBeInTheDocument();
    expect(screen.queryByText(/2026 · TV/)).not.toBeInTheDocument();
  });
});
