/** [text, reading]. reading is "" for text that needs no furigana. */
export type Segment = [text: string, reading: string];

export type Tier = 'beginner' | 'intermediate' | 'advanced';

export interface Sentence {
  segments: Segment[];
  en: string;
  /** Optional audio file, relative to /data/ (e.g. "audio/2026-11-10/s1.mp3"). */
  audio?: string;
}

/** One file per day: public/data/daily/YYYY-MM-DD.json */
export interface DailyWord {
  date: string;
  word: {
    text: string;
    reading: string;
    pos: string[];
    jlpt?: string | null;
    audio?: string;
    /** JMdict entry id the word came from. */
    jmdict_id?: number;
  };
  definition_en: string;
  glosses?: string[];
  definition_ja?: { segments: Segment[]; source: string };
  sentences: Partial<Record<Tier, Sentence[]>>;
  /**
   * model is the Claude model id, "jmdict-only" (no AI text) or "sample-data".
   * verified: passed the deterministic checks. reviewed: also approved by the review pass
   * (absent on older records, which were all reviewed; false for hand-supplied content).
   */
  generated_by?: { model: string; verified: boolean; reviewed?: boolean };
}

/** public/data/archive.json is an array of these, newest first. */
export interface ArchiveEntry {
  date: string;
  text: string;
  reading: string;
  meaning: string;
  jlpt?: string | null;
}
