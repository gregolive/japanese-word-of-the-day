/**
 * Turning jmdict-simplified entries (https://github.com/scriptin/jmdict-simplified, format v3)
 * into compact, learner-friendly pool entries. Pure functions so they can be unit tested.
 */
import { isKanaOnly, isKatakanaOnly, isPlainJapanese } from './kana.ts';

/* ---------- the subset of the jmdict-simplified format we use ---------- */

export interface JmKanji {
  common: boolean;
  text: string;
  tags: string[];
}
export interface JmKana {
  common: boolean;
  text: string;
  tags: string[];
  appliesToKanji: string[];
}
export interface JmSense {
  partOfSpeech: string[];
  appliesToKanji: string[];
  appliesToKana: string[];
  misc: string[];
  gloss: { lang: string; text: string }[];
}
export interface JmWord {
  id: string;
  kanji: JmKanji[];
  kana: JmKana[];
  sense: JmSense[];
}

/* ---------- what we keep ---------- */

export type Jlpt = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export interface PoolEntry {
  /** JMdict entry id. */
  id: number;
  /** Headword as shown (kanji form, or kana when the word is usually written in kana). */
  text: string;
  /** Hiragana/katakana reading from JMdict. */
  reading: string;
  /** Display labels for the main sense, e.g. ["Noun", "Suru verb"]. */
  pos: string[];
  /** Up to 3 senses, each up to 4 English glosses. senses[0] is the main meaning. */
  senses: string[][];
  /** Approximate JLPT level, or null when no list has it (treated as Intermediate). */
  jlpt: Jlpt | null;
  /** Every other common written form (kanji and kana), for matching the word inside sentences. */
  forms: string[];
}

/** Senses or headwords with these JMdict tags are not shown to learners. */
const BAD_MISC = new Set(['arch', 'obs', 'obsc', 'rare', 'dated', 'hist', 'vulg', 'X', 'derog', 'sens', 'sl', 'net-sl', 'male-sl']);
/** Irregular, outdated, rare or search-only spellings. */
const BAD_FORM_TAGS = new Set(['iK', 'oK', 'rK', 'sK', 'ik', 'ok', 'rk', 'sk']);

/** Parts of speech that make a good "word of the day" and work in example sentences. */
const POS_LABELS: [RegExp, string][] = [
  [/^n$/, 'Noun'],
  [/^vs$|^vs-[is]$/, 'Suru verb'],
  [/^v1$/, 'Ichidan verb'],
  [/^v5/, 'Godan verb'],
  [/^vk$/, 'Kuru verb'],
  [/^adj-ix?$/, 'I-adjective'],
  [/^adj-na$/, 'Na-adjective'],
  [/^adj-no$/, 'No-adjective'],
  [/^adv(-to)?$/, 'Adverb'],
];
/** If the main sense is any of these, skip the word (grammar words, affixes, counters, phrases...). */
const BAD_POS = /^(prt|conj|cop|aux|aux-v|aux-adj|ctr|pref|suf|n-pref|n-suf|exp|int|num|unc|pn)$/;

export function posLabels(tags: string[]): string[] {
  const labels: string[] = [];
  for (const tag of tags) {
    const label = POS_LABELS.find(([re]) => re.test(tag))?.[1];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

const englishGlosses = (sense: JmSense) => sense.gloss.filter((g) => g.lang === 'eng').map((g) => g.text);

/**
 * Build a pool entry, or return null when the word isn't a good fit for learners.
 * `jlptLookup` maps "text|reading" (and "reading|reading" for kana words) to a level.
 */
export function toPoolEntry(word: JmWord, jlptLookup: Map<string, Jlpt>): PoolEntry | null {
  const senses = word.sense.filter((s) => englishGlosses(s).length && !s.misc.some((m) => BAD_MISC.has(m)));
  const main = word.sense[0];
  if (!main || senses[0] !== main) return null; // main sense itself is archaic/vulgar/etc.
  if (main.partOfSpeech.some((p) => BAD_POS.test(p))) return null;
  const pos = posLabels(main.partOfSpeech);
  if (!pos.length) return null;

  const kanji = word.kanji.filter((k) => k.common && !k.tags.some((t) => BAD_FORM_TAGS.has(t)));
  const kana = word.kana.filter((k) => k.common && !k.tags.some((t) => BAD_FORM_TAGS.has(t)));
  if (!kana.length) return null;

  // "uk" = usually written in kana: show the kana form as the headword.
  const usuallyKana = main.misc.includes('uk') || !kanji.length;
  const headKanji = usuallyKana ? null : kanji[0];
  const reading = headKanji
    ? kana.find((k) => k.appliesToKanji.includes('*') || k.appliesToKanji.includes(headKanji.text))?.text
    : kana[0].text;
  if (!reading) return null;
  const text = headKanji ? headKanji.text : reading;

  // Keep headwords short and plain: no Latin, digits, symbols, one-kana words or long phrases.
  if (!isPlainJapanese(text) || [...text].length > 5 || [...reading].length > 8) return null;
  if (isKanaOnly(text) && [...text].length < 2) return null;

  const jlpt = jlptLookup.get(`${text}|${reading}`) ?? jlptLookup.get(`${reading}|${reading}`) ?? null;
  // Katakana-only words are mostly loanwords and oddities: keep only the ones on a JLPT list.
  if (isKatakanaOnly(text) && !jlpt) return null;

  const forms = [...new Set([...kanji.map((k) => k.text), ...kana.map((k) => k.text)])].filter((f) => f !== text);

  return {
    id: Number(word.id),
    text,
    reading,
    pos,
    senses: senses.slice(0, 3).map((s) => englishGlosses(s).slice(0, 4)),
    jlpt,
    forms,
  };
}

/* ---------- JLPT list (open-anki-jlpt-decks CSV: expression,reading,meaning,tags,guid) ---------- */

/** Minimal CSV parser (quoted fields, doubled quotes). The input is a known, simple file. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += c;
  }
  if (field || row.length) endRow();
  return rows.filter((r) => r.some((f) => f !== ''));
}

/**
 * Build the "text|reading" -> level map. Files are given easiest first (N5 ... N1);
 * a word listed at several levels keeps the easiest one.
 */
export function buildJlptLookup(files: [Jlpt, string][]): Map<string, Jlpt> {
  const lookup = new Map<string, Jlpt>();
  for (const [level, csv] of files) {
    const [header, ...rows] = parseCsv(csv);
    const ei = header.indexOf('expression');
    const ri = header.indexOf('reading');
    for (const row of rows) {
      const expression = row[ei]?.trim();
      const reading = row[ri]?.trim();
      if (!expression || !reading) continue;
      const key = `${expression}|${reading}`;
      if (!lookup.has(key)) lookup.set(key, level);
    }
  }
  return lookup;
}
