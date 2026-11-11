import { describe, expect, it } from 'vitest';
import { mergeSegments, splitFurigana } from './furigana.ts';
import { toHiragana } from './kana.ts';

describe('splitFurigana', () => {
  it('puts the reading over the kanji only', () => {
    expect(splitFurigana('守り', 'まもり')).toEqual([['守', 'まも'], ['り', '']]);
    expect(splitFurigana('約束', 'やくそく')).toEqual([['約束', 'やくそく']]);
  });

  it('handles kana between kanji', () => {
    expect(splitFurigana('取り消し', 'とりけし')).toEqual([['取', 'と'], ['り', ''], ['消', 'け'], ['し', '']]);
  });

  it('accepts katakana readings from the tokenizer', () => {
    expect(splitFurigana('食べる', toHiragana('タベル'))).toEqual([['食', 'た'], ['べる', '']]);
  });

  it('matches katakana in the word against a hiragana reading', () => {
    expect(splitFurigana('三ヶ月', 'さんかげつ')).toEqual([['三ヶ月', 'さんかげつ']]);
    expect(splitFurigana('お茶', 'おちゃ')).toEqual([['お', ''], ['茶', 'ちゃ']]);
  });

  it('leaves kana-only words without a reading', () => {
    expect(splitFurigana('すっかり', 'すっかり')).toEqual([['すっかり', '']]);
  });

  it('falls back to the whole word when the kana do not line up', () => {
    expect(splitFurigana('明日', 'あした')).toEqual([['明日', 'あした']]);
    expect(splitFurigana('行く', 'かえる')).toEqual([['行く', 'かえる']]);
  });
});

describe('mergeSegments', () => {
  it('joins neighbouring plain text', () => {
    expect(mergeSegments([['約束', 'やくそく'], ['は', ''], ['守', 'まも'], ['り', ''], ['ます。', '']])).toEqual([
      ['約束', 'やくそく'],
      ['は', ''],
      ['守', 'まも'],
      ['ります。', ''],
    ]);
  });
});
