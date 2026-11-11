import type { Segment } from '../../src/lib/types.ts';
import { hasKanji, KANJI_RE, toHiragana } from './kana.ts';

/**
 * Split one word into furigana segments so the ruby covers kanji only.
 *   splitFurigana('守り', 'まもり')   -> [['守', 'まも'], ['り', '']]
 *   splitFurigana('取り消し', 'とりけし') -> [['取', 'と'], ['り', ''], ['消', 'け'], ['し', '']]
 * If the reading can't be lined up with the kana in the word, the whole word gets the whole reading.
 */
export function splitFurigana(surface: string, reading: string): Segment[] {
  const hira = toHiragana(reading);
  if (!hasKanji(surface) || !hira) return [[surface, '']];

  // Alternate runs of kanji and non-kanji.
  const runs = surface.match(new RegExp(`${KANJI_RE.source}+|[^${KANJI_RE.source.slice(1, -1)}]+`, 'gu')) ?? [surface];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = runs.map((run) => (KANJI_RE.test(run) ? '(.+?)' : escape(toHiragana(run)))).join('');
  const match = new RegExp(`^${pattern}$`, 'u').exec(hira);
  if (!match) return [[surface, hira]];

  let group = 1;
  return runs.map((run): Segment => (KANJI_RE.test(run) ? [run, match[group++]] : [run, '']));
}

/** Join neighbouring segments that have no reading, so the data stays compact. */
export function mergeSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const [text, reading] of segments) {
    const last = out[out.length - 1];
    if (!reading && last && !last[1]) last[0] += text;
    else out.push([text, reading]);
  }
  return out;
}

export const segmentsToText = (segments: Segment[]) => segments.map(([text]) => text).join('');
