import { seasonOrdinals, withSeasonOrdinals } from './season-ordinal';

/**
 * Canonical numbers are unique per anime and own the watch URL; the season
 * ordinal is what a viewer reads. The properties that matter: a season always
 * starts at 1, an episode with no season keeps its canonical number, and
 * nothing here ever changes a canonical number.
 */
describe('season ordinals', () => {
  it('restarts numbering in each season', () => {
    // DATE A LIVE as it is actually stored: two seasons over canonical 1-6.
    const episodes = [
      { number: 1, seasonId: 's1' },
      { number: 2, seasonId: 's1' },
      { number: 3, seasonId: 's1' },
      { number: 4, seasonId: 's2' },
      { number: 5, seasonId: 's2' },
      { number: 6, seasonId: 's2' },
    ];

    expect(withSeasonOrdinals(episodes).map((e) => e.seasonEpisodeNumber)).toEqual([1, 2, 3, 1, 2, 3]);
    // The canonical numbers, which the URLs use, are untouched.
    expect(withSeasonOrdinals(episodes).map((e) => e.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('leaves an episode with no season on its canonical number', () => {
    const episodes = [
      { number: 7, seasonId: null },
      { number: 8, seasonId: null },
    ];
    expect(withSeasonOrdinals(episodes).map((e) => e.seasonEpisodeNumber)).toEqual([7, 8]);
  });

  it('handles a title where only some episodes are assigned', () => {
    const episodes = [
      { number: 1, seasonId: null },
      { number: 2, seasonId: 's1' },
      { number: 3, seasonId: 's1' },
    ];
    expect(withSeasonOrdinals(episodes).map((e) => e.seasonEpisodeNumber)).toEqual([1, 1, 2]);
  });

  it('numbers by canonical order, not by the order rows arrive in', () => {
    const episodes = [
      { number: 6, seasonId: 's2' },
      { number: 4, seasonId: 's2' },
      { number: 5, seasonId: 's2' },
    ];
    const byNumber = new Map(withSeasonOrdinals(episodes).map((e) => [e.number, e.seasonEpisodeNumber]));
    expect([byNumber.get(4), byNumber.get(5), byNumber.get(6)]).toEqual([1, 2, 3]);
  });

  it('keeps gaps from renumbering the rest of the season', () => {
    // An admin deletes canonical 5; season 2 still reads 1, 2, 3.
    const episodes = [
      { number: 4, seasonId: 's2' },
      { number: 6, seasonId: 's2' },
      { number: 9, seasonId: 's2' },
    ];
    expect(withSeasonOrdinals(episodes).map((e) => e.seasonEpisodeNumber)).toEqual([1, 2, 3]);
  });

  it('supports decimal specials without collapsing them onto a whole number', () => {
    const episodes = [
      { number: 1, seasonId: 's1' },
      { number: 1.5, seasonId: 's1' },
      { number: 2, seasonId: 's1' },
    ];
    expect(withSeasonOrdinals(episodes).map((e) => e.seasonEpisodeNumber)).toEqual([1, 2, 3]);
  });

  it('assigns nothing when no episode has a season', () => {
    expect(seasonOrdinals([{ number: 1, seasonId: null }]).size).toBe(0);
  });
});
