import { AgeRating, AnimeSource, AnimeType } from '@prisma/client';
import { animeFilters } from './anime.service';
import type { AnimeQueryDto } from './dto/anime-query.dto';

const query = (patch: Partial<AnimeQueryDto>) => patch as AnimeQueryDto;

/** Every condition except the first, which is always "published and not deleted". */
const conditions = (patch: Partial<AnimeQueryDto>) => animeFilters(query(patch)).slice(1);

describe('animeFilters', () => {
  it('asks only for published titles when nothing is selected', () => {
    const all = animeFilters(query({}));
    expect(all).toHaveLength(1);
    expect(conditions({})).toEqual([]);
  });

  describe('preferences', () => {
    it('requires every preferred genre, not just one of them', () => {
      expect(conditions({ genres: ['action', 'adventure'] })).toEqual([
        {
          AND: [
            { genres: { some: { genre: { slug: 'action' } } } },
            { genres: { some: { genre: { slug: 'adventure' } } } },
          ],
        },
      ]);
    });

    it('treats a list of types as any-of', () => {
      expect(conditions({ type: [AnimeType.TV, AnimeType.MOVIE] })).toEqual([
        { type: { in: [AnimeType.TV, AnimeType.MOVIE] } },
      ]);
    });
  });

  describe('avoiding', () => {
    it('excludes a title carrying any avoided genre', () => {
      // One is enough: someone avoiding horror does not want the horror comedy.
      expect(conditions({ avoidGenres: ['horror', 'ecchi'] })).toEqual([
        { NOT: { genres: { some: { genre: { slug: { in: ['horror', 'ecchi'] } } } } } },
      ]);
    });

    it('excludes avoided types', () => {
      expect(conditions({ avoidType: [AnimeType.MUSIC] })).toEqual([
        { type: { notIn: [AnimeType.MUSIC] } },
      ]);
    });

    it('keeps untagged titles when avoiding an age rating', () => {
      // ageRating is nullable, and `NOT IN` is NULL for an unset column, so a
      // plain notIn would drop every unrated title too.
      expect(conditions({ avoidAgeRating: [AgeRating.RX] })).toEqual([
        { OR: [{ ageRating: null }, { ageRating: { notIn: [AgeRating.RX] } }] },
      ]);
    });

    it('keeps untagged titles when avoiding a source', () => {
      expect(conditions({ avoidSource: [AnimeSource.LIGHT_NOVEL] })).toEqual([
        { OR: [{ source: null }, { source: { notIn: [AnimeSource.LIGHT_NOVEL] } }] },
      ]);
    });

    it('ignores empty avoid lists', () => {
      expect(conditions({ avoidGenres: [], avoidType: [], avoidAgeRating: [], avoidSource: [] })).toEqual([]);
    });
  });

  describe('combined', () => {
    it('applies a search, a preference and an avoidance together', () => {
      const result = conditions({ q: 'naruto', genres: ['action'], avoidGenres: ['horror'] });
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('OR');
      expect(result[1]).toEqual({
        AND: [{ genres: { some: { genre: { slug: 'action' } } } }],
      });
      expect(result[2]).toEqual({
        NOT: { genres: { some: { genre: { slug: { in: ['horror'] } } } } },
      });
    });

    it('lets a search never bypass an avoidance', () => {
      // Both conditions sit in the same AND array, so no query can satisfy one
      // while escaping the other.
      const result = animeFilters(query({ q: 'naruto', avoidGenres: ['horror'] }));
      expect(result.some((c) => 'NOT' in c)).toBe(true);
      expect(result.some((c) => 'OR' in c)).toBe(true);
    });

    it('can prefer and avoid within the same dimension', () => {
      const result = conditions({ genres: ['action'], avoidGenres: ['comedy'] });
      expect(result).toEqual([
        { AND: [{ genres: { some: { genre: { slug: 'action' } } } }] },
        { NOT: { genres: { some: { genre: { slug: { in: ['comedy'] } } } } } },
      ]);
    });
  });
});
