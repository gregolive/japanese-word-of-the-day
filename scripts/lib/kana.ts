/** Kana and kanji helpers. Pure functions, no dependencies. */

/** Katakana -> hiragana (leaves everything else, including ー, unchanged). */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Kanji plus the iteration/abbreviation marks that take a reading (々 〆 ヶ). */
export const KANJI_RE = /[\p{Script=Han}々〆ヶ]/u;

export const hasKanji = (s: string) => KANJI_RE.test(s);

export const isKatakanaOnly = (s: string) => /^[\p{Script=Katakana}ー・]+$/u.test(s);

export const isKanaOnly = (s: string) => /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(s);

/** Only hiragana, katakana and kanji: no Latin, digits, symbols or spaces. */
export const isPlainJapanese = (s: string) =>
  /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〆ヶ]+$/u.test(s);
