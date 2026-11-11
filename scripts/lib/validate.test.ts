import { beforeAll, describe, expect, it } from 'vitest';
import { getTokenizer, type Target, type Tokenizer, toSegments } from './tokenizer.ts';
import { type Generated, validate } from './validate.ts';

let tokenizer: Tokenizer;
beforeAll(async () => {
  tokenizer = await getTokenizer();
});

const yakusoku: Target = { text: '約束', reading: 'やくそく', forms: [] };
const mamoru: Target = { text: '守る', reading: 'まもる', forms: [] };

const good = (): Generated => ({
  definition_ja: '人と人が、前にこれからすることを決めること。',
  sentences: {
    beginner: [
      { ja: '友達と会う約束があります。', en: 'I have plans to meet a friend.' },
      { ja: '約束は守ります。', en: 'I will keep my promise.' },
    ],
    intermediate: [
      { ja: '彼は時間の約束をきちんと守る人だ。', en: 'He is someone who keeps to agreed times.' },
      { ja: '雨のせいで、友達との約束を来週に延ばした。', en: 'Because of the rain, I moved my plans with a friend to next week.' },
    ],
    advanced: [
      { ja: '一度交わした約束は、どんな犠牲を払ってでも果たそうとする。', en: 'Once she makes a promise, she tries to keep it at any cost.' },
      { ja: '約束を口にするだけでは、後で争いになりかねない。', en: 'Merely voicing a promise can lead to a dispute later.' },
    ],
  },
});

describe('validate', () => {
  it('passes good content and builds furigana in code', () => {
    const { problems, checked } = validate(good(), yakusoku, tokenizer);
    expect(problems).toEqual([]);
    expect(checked!.sentences.beginner[1].segments).toEqual([
      ['約束', 'やくそく'],
      ['は', ''],
      ['守', 'まも'],
      ['ります。', ''],
    ]);
  });

  it('rejects romaji, spaces and wrong sentence counts', () => {
    const gen = good();
    gen.sentences.beginner[0].ja = 'tomodachi と約束します。';
    gen.sentences.intermediate.pop();
    const { problems } = validate(gen, yakusoku, tokenizer);
    expect(problems).toContain('beginner sentence 1: contains Latin letters (no romaji allowed)');
    expect(problems).toContain('intermediate: expected 2 sentences, got 1');
  });

  it('rejects a sentence without the target word', () => {
    const gen = good();
    gen.sentences.beginner[0] = { ja: '明日は雨が降ります。', en: 'It will rain tomorrow.' };
    expect(validate(gen, yakusoku, tokenizer).problems).toContain('beginner sentence 1: does not contain the word 約束 (in any form)');
  });

  it('rejects a different word that merely contains the target (口約束 is not 約束)', () => {
    const gen = good();
    gen.sentences.advanced[1].ja = '口約束だけでは、後で言った言わないの争いになりかねない。';
    expect(validate(gen, yakusoku, tokenizer).problems).toContain('advanced sentence 2: does not contain the word 約束 (in any form)');
  });

  it('rejects a definition that uses the word itself, or is too long', () => {
    const gen = good();
    gen.definition_ja = '約束のこと。';
    expect(validate(gen, yakusoku, tokenizer).problems).toContain('definition_ja: uses the word 約束 itself');
  });

  it('rejects sentences outside the tier length and multi-sentence answers', () => {
    const gen = good();
    gen.sentences.beginner[0].ja = '約束。';
    gen.sentences.beginner[1].ja = '約束しました。守ります。';
    const { problems } = validate(gen, yakusoku, tokenizer);
    expect(problems).toContain('beginner sentence 1: 3 characters, expected 6-25');
    expect(problems).toContain('beginner sentence 2: must be exactly one sentence');
  });

  it('rejects blocked words', () => {
    const gen = good();
    gen.sentences.advanced[0].en = 'He will kill time until the promise.';
    expect(validate(gen, yakusoku, tokenizer).problems).toContain(
      'advanced sentence 1: English translation contains a blocked word',
    );
  });
});

describe('target matching and furigana', () => {
  it('finds conjugated verbs by their dictionary form', () => {
    const gen = good();
    gen.definition_ja = '大切なものを危なくないようにすること。';
    for (const tier of ['beginner', 'intermediate', 'advanced'] as const) {
      gen.sentences[tier] = [
        { ja: '母はいつも約束を守りました。', en: 'My mother always kept her promises.' },
        { ja: '子どもを危険から守っている先生がいる。', en: 'There is a teacher protecting children from danger.' },
      ];
    }
    const { problems } = validate(gen, mamoru, tokenizer);
    expect(problems.filter((p) => p.includes('does not contain'))).toEqual([]);
  });

  it("uses JMdict's reading for the headword", () => {
    const today: Target = { text: '今日', reading: 'きょう', forms: [] };
    const segments = toSegments(tokenizer.tokenize('今日は晴れです。'), today);
    expect(segments[0]).toEqual(['今日', 'きょう']);
  });
});
