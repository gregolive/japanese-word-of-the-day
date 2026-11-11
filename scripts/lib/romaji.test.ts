import { describe, expect, it } from 'vitest';
import { shortMeaning } from './meaning.ts';
import { findRomaji, normalizeRomaji, romajiGlosses, toRomaji } from './romaji.ts';

describe('toRomaji', () => {
  it('converts kana to Hepburn', () => {
    expect(toRomaji('とこのま')).toBe('tokonoma');
    expect(toRomaji('こたつ')).toBe('kotatsu');
    expect(toRomaji('ひのまる')).toBe('hinomaru');
    expect(toRomaji('しゅっけつ')).toBe('shukketsu');
    expect(toRomaji('まっちゃ')).toBe('matcha');
    expect(toRomaji('ラーメン')).toBe('raamen');
  });
});

describe('normalizeRomaji', () => {
  it('folds long vowels and macrons', () => {
    expect(normalizeRomaji('Tōkyō')).toBe(normalizeRomaji('toukyou'));
    expect(normalizeRomaji('shimbun')).toBe(normalizeRomaji('shinbun'));
  });
});

describe('romajiGlosses', () => {
  it('finds the romanized headword among the glosses', () => {
    expect(romajiGlosses('とこのま', ['tokonoma', 'alcove where art or flowers are displayed'])).toEqual(['tokonoma']);
    expect(romajiGlosses('ひのまる', ['national flag of Japan', 'Hinomaru'])).toEqual(['Hinomaru']);
  });
  it('ignores English loanwords and unrelated glosses', () => {
    expect(romajiGlosses('さけ', ['alcohol', 'sake'])).toEqual([]);
    expect(romajiGlosses('たけ', ['bamboo'])).toEqual([]);
  });
});

describe('findRomaji', () => {
  it('matches whole words, any case, plural', () => {
    expect(findRomaji('The cat is inside the Kotatsu.', ['kotatsu'])).toEqual(['kotatsu']);
    expect(findRomaji('Stylish kotatsus are common.', ['kotatsu'])).toEqual(['kotatsu']);
    expect(findRomaji('A hinomaru-bento.', ['Hinomaru'])).toEqual(['Hinomaru']);
    expect(findRomaji('A hinomaru bento.', ['Hinomaru'])).toEqual(['Hinomaru']);
    expect(findRomaji('The heated table.', ['kotatsu'])).toEqual([]);
  });
});

describe('shortMeaning', () => {
  it('keeps short definitions as two glosses', () => {
    expect(shortMeaning('bleeding; haemorrhage; hemorrhage')).toBe('bleeding; haemorrhage');
    expect(shortMeaning('to put into (e.g. emotion, effort); to include')).toBe('to put into (e.g. emotion, effort); to include');
    expect(shortMeaning('to put into (e.g. emotion, effort); to load (a gun)')).toBe('to put into (e.g. emotion, effort)');
  });
  it('shortens one long gloss', () => {
    expect(
      shortMeaning('table over an electric heater, with a hanging quilt to retain heat (orig. over a charcoal brazier in a floor well)'),
    ).toBe('table over an electric heater');
    expect(shortMeaning('a very long gloss without any commas that just keeps going on and on')).toMatch(/^.{1,48}$/);
  });
});
