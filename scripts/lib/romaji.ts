/**
 * Romaji detection for English text. The site never shows romaji, but JMdict glosses often
 * include the romanized headword ("tokonoma; alcove ..."), and models copy it into translations.
 * Pure functions, no dependencies.
 */
import { toHiragana } from './kana.ts';

const DIGRAPHS: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho', ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo', ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo', じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo', ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo', ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
};
const SINGLE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゔ: 'vu',
};

/** Hepburn romaji for a kana string (katakana included). Unknown characters are dropped. */
export function toRomaji(kana: string): string {
  const s = toHiragana(kana);
  let out = '';
  let double = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === 'っ') {
      double = true;
      continue;
    }
    if (c === 'ー') {
      out += out.at(-1) ?? '';
      continue;
    }
    const syllable = DIGRAPHS[c + (s[i + 1] ?? '')] ?? SINGLE[c] ?? '';
    if (DIGRAPHS[c + (s[i + 1] ?? '')]) i++;
    out += double && syllable ? (syllable.startsWith('ch') ? 't' : syllable[0]) + syllable : syllable;
    double = false;
  }
  return out;
}

/** Fold spelling variants together: macrons, long vowels (ou/oo/uu), n' and m before b/p. */
export function normalizeRomaji(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/n'/g, 'n')
    .replace(/m(?=[bp])/g, 'n')
    .replace(/o[ou]/g, 'o')
    .replace(/uu/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/ii/g, 'i')
    .replace(/[^a-z]/g, '');
}

/** Japanese words that are ordinary English; they may appear in translations. */
const ENGLISH_LOANWORDS = new Set(
  [
    'anime', 'bonsai', 'emoji', 'futon', 'haiku', 'judo', 'karaoke', 'karate', 'kimono', 'manga', 'miso',
    'ninja', 'origami', 'ramen', 'sake', 'samurai', 'sashimi', 'sumo', 'sushi', 'tempura', 'tofu', 'tsunami',
    'wasabi', 'zen',
  ].map(normalizeRomaji),
);

/**
 * Glosses that are just the headword in romaji (e.g. "tokonoma" for とこのま).
 * They must not be shown, and translations must not use them.
 */
export function romajiGlosses(reading: string, glosses: string[]): string[] {
  const romaji = normalizeRomaji(toRomaji(reading));
  if (!romaji || ENGLISH_LOANWORDS.has(romaji)) return [];
  return glosses.filter((g) => normalizeRomaji(g) === romaji);
}

/** The banned romaji words that occur in `text` (whole words, optional plural "s"). */
export function findRomaji(text: string, banned: string[]): string[] {
  const words = text.split(/[^\p{L}']+/u).map(normalizeRomaji).filter(Boolean);
  return banned.filter((b) => {
    const r = normalizeRomaji(b);
    return words.some((w) => w === r || w === `${r}s`);
  });
}
