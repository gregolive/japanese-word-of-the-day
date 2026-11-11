import { describe, expect, it } from 'vitest';
import { buildJlptLookup, type Jlpt, type JmWord, parseCsv, posLabels, toPoolEntry } from './jmdict.ts';

const sense = (pos: string[], glosses: string[], misc: string[] = []) => ({
  partOfSpeech: pos,
  appliesToKanji: ['*'],
  appliesToKana: ['*'],
  misc,
  gloss: glosses.map((text) => ({ lang: 'eng', text })),
});
const kanji = (text: string, tags: string[] = []) => ({ common: true, text, tags });
const kana = (text: string, tags: string[] = []) => ({ common: true, text, tags, appliesToKanji: ['*'] });

const yakusoku: JmWord = {
  id: '1601050',
  kanji: [kanji('約束')],
  kana: [kana('やくそく')],
  sense: [sense(['n', 'vs', 'vt'], ['promise', 'agreement']), sense(['n'], ['convention', 'rule'])],
};
const lookup = new Map<string, Jlpt>([['約束|やくそく', 'N4'], ['すっかり|すっかり', 'N3']]);

describe('toPoolEntry', () => {
  it('keeps a normal word with its level, labels and senses', () => {
    expect(toPoolEntry(yakusoku, lookup)).toEqual({
      id: 1601050,
      text: '約束',
      reading: 'やくそく',
      pos: ['Noun', 'Suru verb'],
      senses: [['promise', 'agreement'], ['convention', 'rule']],
      jlpt: 'N4',
      forms: ['やくそく'],
    });
  });

  it('shows the kana form for words usually written in kana (uk)', () => {
    const word: JmWord = {
      id: '1',
      kanji: [kanji('悉皆')],
      kana: [kana('すっかり')],
      sense: [sense(['adv'], ['completely'], ['uk'])],
    };
    expect(toPoolEntry(word, lookup)).toMatchObject({ text: 'すっかり', reading: 'すっかり', forms: ['悉皆'] });
  });

  it('skips archaic, vulgar and grammar words', () => {
    expect(toPoolEntry({ ...yakusoku, sense: [sense(['n'], ['x'], ['arch'])] }, lookup)).toBeNull();
    expect(toPoolEntry({ ...yakusoku, sense: [sense(['n'], ['x'], ['vulg'])] }, lookup)).toBeNull();
    expect(toPoolEntry({ ...yakusoku, sense: [sense(['prt'], ['x'])] }, lookup)).toBeNull();
    expect(toPoolEntry({ ...yakusoku, sense: [sense(['exp'], ['x'])] }, lookup)).toBeNull();
  });

  it('drops unsuitable later senses but keeps the word', () => {
    const word = { ...yakusoku, sense: [sense(['n'], ['promise']), sense(['n'], ['slang meaning'], ['sl'])] };
    expect(toPoolEntry(word, lookup)?.senses).toEqual([['promise']]);
  });

  it('skips irregular spellings and falls back to the next kanji form', () => {
    const word = { ...yakusoku, kanji: [kanji('約足', ['iK']), kanji('約束')] };
    expect(toPoolEntry(word, lookup)?.text).toBe('約束');
  });

  it('skips katakana words that are on no JLPT list', () => {
    const word: JmWord = { id: '2', kanji: [], kana: [kana('ガレージ')], sense: [sense(['n'], ['garage'])] };
    expect(toPoolEntry(word, lookup)).toBeNull();
    expect(toPoolEntry(word, new Map([['ガレージ|ガレージ', 'N3']]))?.text).toBe('ガレージ');
  });

  it('skips headwords with Latin letters, symbols, or too many characters', () => {
    const latin: JmWord = { id: '3', kanji: [kanji('Ｔシャツ')], kana: [kana('ティーシャツ')], sense: [sense(['n'], ['T-shirt'])] };
    const long: JmWord = { id: '4', kanji: [kanji('国際連合安全')], kana: [kana('こくさい')], sense: [sense(['n'], ['x'])] };
    expect(toPoolEntry(latin, lookup)).toBeNull();
    expect(toPoolEntry(long, lookup)).toBeNull();
  });
});

describe('posLabels', () => {
  it('maps JMdict tags to display labels without duplicates', () => {
    expect(posLabels(['v5r', 'vi', 'vt'])).toEqual(['Godan verb']);
    expect(posLabels(['adj-na', 'n', 'vs'])).toEqual(['Na-adjective', 'Noun', 'Suru verb']);
  });
});

describe('JLPT lists', () => {
  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });

  it('keeps the easiest level when a word is on several lists', () => {
    const csv = (rows: string) => `expression,reading,meaning,tags,guid\n${rows}`;
    const map = buildJlptLookup([
      ['N5', csv('会う,あう,"to meet",JLPT,a')],
      ['N4', csv('会う,あう,"to meet",JLPT,a\n約束,やくそく,promise,JLPT,b')],
    ]);
    expect(map.get('会う|あう')).toBe('N5');
    expect(map.get('約束|やくそく')).toBe('N4');
  });
});
