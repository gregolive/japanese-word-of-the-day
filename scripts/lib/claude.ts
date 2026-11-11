/**
 * The two Claude calls: write the day's content, then review it.
 * Both use structured outputs so the response is schema-valid JSON, not free text.
 * Readings/furigana are never requested from the model (they come from the tokenizer).
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { PoolEntry } from './jmdict.ts';
import { SENTENCES_PER_TIER, TIER_LENGTH, type Generated } from './validate.ts';

export const GENERATE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
export const VERIFY_MODEL = process.env.CLAUDE_VERIFY_MODEL || GENERATE_MODEL;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

const SentenceSchema = z.object({
  ja: z.string().describe('The Japanese sentence. Kana and kanji only: no furigana, no romaji, no spaces.'),
  en: z.string().describe('A natural, faithful English translation.'),
});
const GeneratedSchema = z.object({
  definition_ja: z.string(),
  sentences: z.object({
    beginner: z.array(SentenceSchema),
    intermediate: z.array(SentenceSchema),
    advanced: z.array(SentenceSchema),
  }),
});
const ReviewSchema = z.object({
  pass: z.boolean(),
  problems: z.array(z.string()).describe('Every problem found, one per item. Empty when pass is true.'),
});
export type Review = z.infer<typeof ReviewSchema>;

const [b, i, a] = [TIER_LENGTH.beginner, TIER_LENGTH.intermediate, TIER_LENGTH.advanced];

const GENERATE_SYSTEM = `You write content for a Japanese word-of-the-day website for English-speaking learners. You are given one Japanese word with its dictionary data. Write:

1. definition_ja: the word's main meaning explained in simple Japanese, for a learner. One or two short sentences, using only basic (JLPT N5-N4) vocabulary and grammar. Do not use the word itself. End each sentence with 。.

2. sentences: exactly ${SENTENCES_PER_TIER} example sentences for each of three levels:
   - beginner: JLPT N5-N4 grammar and vocabulary, polite です/ます style, ${b[0]}-${b[1]} characters.
   - intermediate: JLPT N3-N2 grammar and vocabulary, ${i[0]}-${i[1]} characters.
   - advanced: JLPT N1 level, natural written or formal register with some nuance, ${a[0]}-${a[1]} characters.
   Every sentence must use the target word, written with the same spelling as the headword (conjugate verbs and adjectives as normal). The word may be harder than the level: build the rest of the sentence at the level's difficulty. Use the word in one of the listed meanings, preferably the first. Each sentence is a single sentence about one clear, everyday situation, ending in 。, ！ or ？, and the two sentences in a level should show different situations.

Rules for all Japanese text: natural, correct Japanese as a native speaker would write it. Kana and kanji only: no romaji, no Latin letters, no spaces, no readings in brackets. Use kanji where a native writer normally would.

Content rules: no real people, companies or brands; ordinary fictional people (友達, 先生, 母, 田中さん) are fine. Avoid politics, religion, violence, crime, death, illness, alcohol, sexual content and anything else that could upset a learner. Keep the tone friendly and everyday.

Each English translation is natural English that faithfully matches the Japanese.`;

const VERIFY_SYSTEM = `You are a native-level Japanese teacher reviewing content written for an English-speaking learner's word-of-the-day website. The learner will trust it completely, so be strict about correctness but do not fail content for mere style preferences.

Fail the content (pass: false) if any of these is true, and list every problem:
- A Japanese sentence or the definition is ungrammatical, unnatural, or something a native speaker would not write.
- The target word is used with the wrong meaning, wrong usage, or wrong collocation.
- An English translation is inaccurate or misleading.
- definition_ja is wrong, misleading, or not simple Japanese.
- A sentence clearly does not fit its level (for example, advanced grammar in a beginner sentence).
- Any content is sensitive or unsuitable (politics, religion, violence, death, illness, alcohol, sexual content, real people or brands).

Otherwise pass: true with an empty problems list.`;

function wordFacts(entry: PoolEntry): string {
  return JSON.stringify(
    {
      headword: entry.text,
      reading: entry.reading,
      parts_of_speech: entry.pos,
      meanings: entry.senses.map((glosses) => glosses.join('; ')),
      approx_jlpt_level: entry.jlpt ?? 'unknown',
    },
    null,
    2,
  );
}

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

/** Throws on refusal or unparseable output, so the caller counts it as a failed attempt. */
function parsedOrThrow<T>(response: { stop_reason: string | null; parsed_output: T | null }, what: string): T {
  if (response.stop_reason === 'refusal') throw new Error(`${what}: the model declined the request`);
  if (response.stop_reason === 'max_tokens') throw new Error(`${what}: response was cut off (max_tokens)`);
  if (!response.parsed_output) throw new Error(`${what}: response did not match the schema`);
  return response.parsed_output;
}

export async function generate(entry: PoolEntry, feedback: string[] = []): Promise<{ generated: Generated; usage: Usage }> {
  let prompt = `Word data:\n${wordFacts(entry)}`;
  if (feedback.length) {
    prompt += `\n\nA previous attempt was rejected. Fix all of these problems:\n${feedback.map((p) => `- ${p}`).join('\n')}`;
  }
  const response = await getClient().messages.parse({
    model: GENERATE_MODEL,
    max_tokens: 16000,
    system: GENERATE_SYSTEM,
    output_config: { effort: 'medium', format: zodOutputFormat(GeneratedSchema) },
    messages: [{ role: 'user', content: prompt }],
  });
  return { generated: parsedOrThrow(response, 'generate'), usage: response.usage };
}

export async function review(entry: PoolEntry, generated: Generated): Promise<{ review: Review; usage: Usage }> {
  const prompt = `Word data:\n${wordFacts(entry)}\n\nContent to review:\n${JSON.stringify(generated, null, 2)}`;
  const response = await getClient().messages.parse({
    model: VERIFY_MODEL,
    max_tokens: 16000,
    system: VERIFY_SYSTEM,
    output_config: { effort: 'medium', format: zodOutputFormat(ReviewSchema) },
    messages: [{ role: 'user', content: prompt }],
  });
  return { review: parsedOrThrow(response, 'review'), usage: response.usage };
}
