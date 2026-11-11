/**
 * Japanese tokenizer (kuromoji, IPADIC). Used for two things the LLM is never trusted with:
 * finding the target word inside a sentence, and producing furigana readings.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import kuromoji from 'kuromoji';
import type { Segment } from '../../src/lib/types.ts';
import { mergeSegments, splitFurigana } from './furigana.ts';
import { hasKanji, toHiragana } from './kana.ts';

export type Token = kuromoji.IpadicFeatures;
export type Tokenizer = kuromoji.Tokenizer<Token>;

let cached: Promise<Tokenizer> | undefined;

export function getTokenizer(): Promise<Tokenizer> {
  const dicPath = join(dirname(createRequire(import.meta.url).resolve('kuromoji')), '..', 'dict');
  cached ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
  });
  return cached;
}

/** The target word, as the sentence checker and furigana generator need it. */
export interface Target {
  text: string;
  reading: string;
  /** Other accepted written forms (kana spelling, alternative kanji). */
  forms: string[];
}

const targetForms = (t: Target) => new Set([t.text, t.reading, ...t.forms]);

/**
 * Where the target word appears in the tokens, as [start, end) token indexes, or null.
 * Matches 1-4 consecutive tokens whose surfaces join to a form of the word, or whose last token
 * is in dictionary form (conjugated verbs/adjectives: 守り + ます -> 守る).
 */
export function findTarget(tokens: Token[], target: Target): [number, number] | null {
  const forms = targetForms(target);
  for (let start = 0; start < tokens.length; start++) {
    let surfaces = '';
    for (let end = start + 1; end <= Math.min(start + 4, tokens.length); end++) {
      const last = tokens[end - 1];
      const withBase = surfaces + (last.basic_form !== '*' ? last.basic_form : last.surface_form);
      surfaces += last.surface_form;
      if (forms.has(surfaces) || forms.has(withBase)) return [start, end];
    }
  }
  return null;
}

/**
 * Furigana segments for a sentence, from the tokenizer's readings.
 * When the target word appears with exactly its headword spelling, JMdict's reading wins
 * (the tokenizer can pick a different reading for homographs, e.g. 今日 こんにち).
 */
export function toSegments(tokens: Token[], target?: Target): Segment[] {
  const segments: Segment[] = [];
  const span = target ? findTarget(tokens, target) : null;
  for (let i = 0; i < tokens.length; i++) {
    if (span && i === span[0]) {
      const surface = tokens.slice(span[0], span[1]).map((t) => t.surface_form).join('');
      if (surface === target!.text) {
        segments.push(...splitFurigana(surface, target!.reading));
        i = span[1] - 1;
        continue;
      }
    }
    const { surface_form: surface, reading } = tokens[i];
    segments.push(...(hasKanji(surface) && reading ? splitFurigana(surface, toHiragana(reading)) : [[surface, ''] as Segment]));
  }
  return mergeSegments(segments);
}

/** True when every kanji in the text got a reading (unknown words come back without one). */
export const allKanjiRead = (segments: Segment[]) => segments.every(([text, reading]) => !hasKanji(text) || !!reading);
