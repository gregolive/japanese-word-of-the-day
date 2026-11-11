import { describe, expect, it } from 'vitest';
import { seededShuffle } from './random.ts';

describe('seededShuffle', () => {
  const items = Array.from({ length: 50 }, (_, i) => i);

  it('gives the same order for the same seed', () => {
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
  });

  it('gives a different order for a different seed', () => {
    expect(seededShuffle(items, 42)).not.toEqual(seededShuffle(items, 43));
  });

  it('is a permutation and leaves the input alone', () => {
    const copy = items.slice();
    expect(seededShuffle(items, 7).sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual(copy);
  });

  it('is stable across releases (pool order depends on it)', () => {
    expect(seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 20261111)).toMatchInlineSnapshot(`
      [
        3,
        6,
        2,
        1,
        4,
        8,
        7,
        5,
      ]
    `);
  });
});
