import { describe, expect, it } from 'vitest';
import { searchTerm } from './search';

describe('searchTerm', () => {
  it('accepts a single character', () => {
    expect(searchTerm('a')).toBe('a');
    expect(searchTerm('A')).toBe('A');
  });

  it('accepts longer queries unchanged', () => {
    expect(searchTerm('an')).toBe('an');
    expect(searchTerm('Anime')).toBe('Anime');
  });

  it('trims surrounding whitespace', () => {
    expect(searchTerm('  a  ')).toBe('a');
  });

  it('treats empty and whitespace-only input as no search', () => {
    // Sending these would mean "no filter" and return the whole catalogue.
    expect(searchTerm('')).toBeNull();
    expect(searchTerm('   ')).toBeNull();
    expect(searchTerm(null)).toBeNull();
    expect(searchTerm(undefined)).toBeNull();
  });
});
