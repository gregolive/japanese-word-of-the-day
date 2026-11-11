/**
 * Publish the word for a date: public/data/daily/<date>.json + archive.json + state/used.json.
 *
 *   node scripts/daily.ts                         # date = UTC today + 2 (see CLAUDE.md)
 *   node scripts/daily.ts --date 2026-11-12       # a specific date
 *   node scripts/daily.ts --date 2026-11-05 --count 7   # a run of consecutive dates (backfill)
 *   node scripts/daily.ts --dry-run               # generate and check, print, write nothing
 *   node scripts/daily.ts --date 2026-11-04 --count 10 --content file.json
 *        # publish content written elsewhere: same deterministic checks, then the review pass.
 *        # Without ANTHROPIC_API_KEY this refuses unless --no-review is given; the day is then
 *        # recorded as generated_by.reviewed = false and the page says so.
 *   node scripts/daily.ts --revise file.json [--no-review]
 *        # replace the content of already-published dates (same format as --content); the
 *        # word stays, the cursor does not move
 *
 * Needs ANTHROPIC_API_KEY. Idempotent: a date that already has a (non-sample) file is skipped.
 * Content that fails a deterministic check or the review pass is never published: after
 * MAX_ATTEMPTS the day falls back to dictionary-only content (no AI text).
 */
import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { addDays, isValidDate } from '../src/lib/dates.ts';
import type { ArchiveEntry, DailyWord } from '../src/lib/types.ts';
import { GENERATE_MODEL, generate, review, VERIFY_MODEL } from './lib/claude.ts';
import type { PoolEntry } from './lib/jmdict.ts';
import { shortMeaning } from './lib/meaning.ts';
import { romajiGlosses } from './lib/romaji.ts';
import { getTokenizer, type Target } from './lib/tokenizer.ts';
import { TIERS, validate, type Checked, type Generated } from './lib/validate.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAILY_DIR = join(ROOT, 'public/data/daily');
const ARCHIVE = join(ROOT, 'public/data/archive.json');
const POOL = join(ROOT, 'state/pool.json');
const USED = join(ROOT, 'state/used.json');
const RUNS = join(ROOT, 'state/runs.jsonl');

const MAX_ATTEMPTS = 3;
const RUNS_KEPT = 200;
/** Publish this many days ahead of the UTC date so UTC+14 already has its file. */
const DAYS_AHEAD = 2;

interface Used {
  cursor: number;
  history: { date: string; id: number }[];
}

/* ---------- files ---------- */

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

/** Write via a temp file and rename, so a crash never leaves a half-written file. */
function writeJson(file: string, data: unknown): void {
  const tmp = `${file}.tmp`;
  // Keep each [text, reading] segment on one line so daily files stay readable.
  const json = JSON.stringify(data, null, 2).replace(/\[\s+("(?:[^"\\]|\\.)*"),\s+("(?:[^"\\]|\\.)*")\s+\]/g, '[$1, $2]');
  writeFileSync(tmp, `${json}\n`);
  renameSync(tmp, file);
}

const dailyPath = (date: string) => join(DAILY_DIR, `${date}.json`);
const isSample = (day: DailyWord) => day.generated_by?.model === 'sample-data';

function hasRealFile(date: string): boolean {
  return existsSync(dailyPath(date)) && !isSample(readJson<DailyWord>(dailyPath(date)));
}

/** Sample files were placeholders from the scaffold: drop them once real words are published. */
function removeSampleData(): string[] {
  const removed: string[] = [];
  for (const file of readdirSync(DAILY_DIR).filter((f) => f.endsWith('.json'))) {
    const path = join(DAILY_DIR, file);
    if (isSample(readJson<DailyWord>(path))) {
      unlinkSync(path);
      removed.push(file.replace('.json', ''));
    }
  }
  return removed;
}

function updateArchive(entry: ArchiveEntry, removedDates: string[]): void {
  const archive = existsSync(ARCHIVE) ? readJson<ArchiveEntry[]>(ARCHIVE) : [];
  const drop = new Set([entry.date, ...removedDates]);
  const next = [entry, ...archive.filter((e) => !drop.has(e.date))].sort((x, y) => (x.date < y.date ? 1 : -1));
  writeJson(ARCHIVE, next);
}

function logRun(run: Record<string, unknown>): void {
  appendFileSync(RUNS, `${JSON.stringify({ at: new Date().toISOString(), ...run })}\n`);
  const lines = readFileSync(RUNS, 'utf8').trim().split('\n');
  if (lines.length > RUNS_KEPT) writeFileSync(RUNS, `${lines.slice(-RUNS_KEPT).join('\n')}\n`);
}

/* ---------- building the record ---------- */

/** `sense` = which JMdict meaning the content uses; it becomes the English definition. */
function baseRecord(date: string, entry: PoolEntry, sense = 0): DailyWord {
  const index = Number.isInteger(sense) && sense >= 0 && sense < entry.senses.length ? sense : 0;
  // JMdict often lists the headword in romaji as a gloss ("tokonoma; alcove ..."): drop it.
  const romaji = new Set(bannedRomaji(entry));
  const keep = (glosses: string[]) => glosses.filter((g) => !romaji.has(g));
  const main = keep(entry.senses[index]).length ? keep(entry.senses[index]) : entry.senses[index];
  const rest = entry.senses.filter((_, i) => i !== index);
  const also = keep(rest.flat()).filter((g) => !main.includes(g)).slice(0, 6);
  return {
    date,
    word: { text: entry.text, reading: entry.reading, pos: entry.pos, jlpt: entry.jlpt, jmdict_id: entry.id },
    definition_en: main.join('; '),
    ...(also.length ? { glosses: also } : {}),
    sentences: {},
  };
}

/** Romanized-headword glosses: hidden from the definition and banned from translations. */
const bannedRomaji = (entry: PoolEntry) => romajiGlosses(entry.reading, entry.senses.flat());

/** `reviewed`: whether the review pass (VERIFY_MODEL) approved it, on top of the deterministic checks. */
function aiRecord(date: string, entry: PoolEntry, checked: Checked, sense: number | undefined, model: string, reviewed: boolean): DailyWord {
  const record = baseRecord(date, entry, sense);
  record.definition_ja = { segments: checked.definitionSegments, source: 'ai' };
  for (const tier of TIERS) record.sentences[tier] = checked.sentences[tier];
  record.generated_by = { model, verified: true, reviewed };
  return record;
}

/** No AI text at all: JMdict meanings only. Nothing unchecked, so it counts as verified. */
function fallbackRecord(date: string, entry: PoolEntry): DailyWord {
  return { ...baseRecord(date, entry), generated_by: { model: 'jmdict-only', verified: true } };
}

/** Errors that retrying won't fix (bad key, no access, unknown model): stop the run. */
const isFatal = (err: unknown) =>
  err instanceof Anthropic.AuthenticationError ||
  err instanceof Anthropic.PermissionDeniedError ||
  err instanceof Anthropic.NotFoundError ||
  err instanceof Anthropic.BadRequestError;

/* ---------- one date ---------- */

/** Content written outside the daily job (e.g. a hand-made backfill). It still goes through every check. */
interface ManualContent {
  /** Who wrote it, recorded in generated_by.model (e.g. "claude-opus-5-5"). */
  model: string;
  /** date -> content; `word` must match the day's word, so days can't drift out of order. */
  days: Record<string, Generated & { word: string }>;
}

/**
 * Deterministic checks, then the review pass unless `skipReview`. Throws on any failure:
 * hand-written content is fixed by hand, there is no retry or fallback.
 */
async function checkManual(date: string, entry: PoolEntry, generated: Generated, skipReview: boolean): Promise<Checked> {
  const target: Target = { text: entry.text, reading: entry.reading, forms: entry.forms };
  const { problems, checked } = validate(generated, target, await getTokenizer(), bannedRomaji(entry));
  if (!checked) throw new Error(`${date} (${entry.text}) failed the checks:\n  - ${problems.join('\n  - ')}`);
  if (skipReview) {
    console.log(`${date}: ${entry.text} passed the deterministic checks (review pass skipped)`);
    return checked;
  }
  const { review: rev } = await review(entry, generated);
  if (!rev.pass) {
    throw new Error(`${date} (${entry.text}) was rejected by the review pass:\n  - ${rev.problems.join('\n  - ') || 'no details'}`);
  }
  console.log(`${date}: ${entry.text} passed all checks and the review pass`);
  return checked;
}

async function publishManual(date: string, manual: ManualContent, skipReview: boolean, dryRun: boolean): Promise<void> {
  if (hasRealFile(date)) {
    console.log(`${date}: already published, skipping`);
    return;
  }
  const generated = manual.days[date];
  if (!generated) throw new Error(`${date}: no entry in the content file`);
  const pool = readJson<{ entries: PoolEntry[] }>(POOL).entries;
  const used = readJson<Used>(USED);
  const entry = pool[used.cursor];
  if (!entry) throw new Error(`Word pool exhausted (cursor ${used.cursor} of ${pool.length})`);
  if (generated.word !== entry.text) {
    throw new Error(`${date}: content is for ${generated.word}, but the next pool word is ${entry.text}`);
  }

  const checked = await checkManual(date, entry, generated, skipReview);
  const record = aiRecord(date, entry, checked, generated.sense, manual.model, !skipReview);
  if (dryRun) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }
  write(date, entry, record, { outcome: 'manual', attempts: 1, model: manual.model, reviewed: !skipReview });
}

/** Replace the content of a published date. The word, cursor and history stay as they are. */
async function revise(date: string, manual: ManualContent, skipReview: boolean, dryRun: boolean): Promise<void> {
  if (!hasRealFile(date)) throw new Error(`${date}: not published, nothing to revise`);
  const current = readJson<DailyWord>(dailyPath(date));
  const generated = manual.days[date];
  const entry = readJson<{ entries: PoolEntry[] }>(POOL).entries.find((e) => e.id === current.word.jmdict_id);
  if (!entry) throw new Error(`${date}: JMdict entry ${current.word.jmdict_id} is not in the pool`);
  if (!generated) throw new Error(`${date}: no entry in the content file`);
  if (generated.word !== entry.text) throw new Error(`${date}: content is for ${generated.word}, but the day's word is ${entry.text}`);

  const checked = await checkManual(date, entry, generated, skipReview);
  const record = aiRecord(date, entry, checked, generated.sense, manual.model, !skipReview);
  if (dryRun) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }
  writeJson(dailyPath(date), record);
  updateArchive(archiveEntry(date, entry, record), []);
  logRun({ date, word: entry.text, id: entry.id, outcome: 'revised', model: manual.model, reviewed: !skipReview });
}

const archiveEntry = (date: string, entry: PoolEntry, record: DailyWord): ArchiveEntry => ({
  date,
  text: entry.text,
  reading: entry.reading,
  meaning: shortMeaning(record.definition_en),
  jlpt: entry.jlpt,
});

/** Persist one published day: cursor, daily file, archive (dropping sample data), run log. */
function write(date: string, entry: PoolEntry, record: DailyWord, run: Record<string, unknown>): void {
  const used = readJson<Used>(USED);
  // Advance the cursor first: if a later write fails, the word is skipped, never repeated.
  writeJson(USED, { cursor: used.cursor + 1, history: [...used.history, { date, id: entry.id }] });
  writeJson(dailyPath(date), record);
  const removed = removeSampleData();
  updateArchive(archiveEntry(date, entry, record), removed);
  logRun({ date, word: entry.text, id: entry.id, ...run });
  if (removed.length) console.log(`  removed sample data for ${removed.join(', ')}`);
}

async function publish(date: string, dryRun: boolean): Promise<void> {
  if (hasRealFile(date)) {
    console.log(`${date}: already published, skipping`);
    return;
  }
  const pool = readJson<{ entries: PoolEntry[] }>(POOL).entries;
  const used = readJson<Used>(USED);
  const entry = pool[used.cursor];
  if (!entry) throw new Error(`Word pool exhausted (cursor ${used.cursor} of ${pool.length})`);

  const target: Target = { text: entry.text, reading: entry.reading, forms: entry.forms };
  const tokenizer = await getTokenizer();
  const tokens = { input_tokens: 0, output_tokens: 0 };
  const addUsage = (u: { input_tokens: number; output_tokens: number }) => {
    tokens.input_tokens += u.input_tokens;
    tokens.output_tokens += u.output_tokens;
  };

  console.log(`${date}: ${entry.text} (${entry.reading}, ${entry.jlpt ?? 'no level'})`);
  let feedback: string[] = [];
  let checked: Checked | undefined;
  let sense: number | undefined;
  const attemptLog: string[][] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !checked; attempt++) {
    try {
      const gen = await generate(entry, feedback);
      addUsage(gen.usage);
      const result = validate(gen.generated, target, tokenizer, bannedRomaji(entry));
      if (result.problems.length) {
        feedback = result.problems;
      } else {
        const rev = await review(entry, gen.generated);
        addUsage(rev.usage);
        if (rev.review.pass) {
          checked = result.checked;
          sense = gen.generated.sense;
        }
        else feedback = rev.review.problems.length ? rev.review.problems : ['Reviewer rejected the content without details'];
      }
    } catch (err) {
      if (isFatal(err)) throw err;
      feedback = [err instanceof Error ? err.message : String(err)];
    }
    if (!checked) {
      attemptLog.push(feedback);
      console.log(`  attempt ${attempt} failed:\n    - ${feedback.join('\n    - ')}`);
    }
  }

  const record = checked ? aiRecord(date, entry, checked, sense, GENERATE_MODEL, true) : fallbackRecord(date, entry);
  const outcome = checked ? 'ai' : 'fallback';
  if (!checked) console.log(`::warning::${date}: AI content failed ${MAX_ATTEMPTS} times; published dictionary-only content`);

  if (dryRun) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  write(date, entry, record, {
    outcome,
    attempts: attemptLog.length + (checked ? 1 : 0),
    model: GENERATE_MODEL,
    verify_model: VERIFY_MODEL,
    ...tokens,
    ...(attemptLog.length ? { problems: attemptLog } : {}),
  });
  console.log(`  published (${outcome}); tokens in ${tokens.input_tokens}, out ${tokens.output_tokens}`);
}

/* ---------- CLI ---------- */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const start = arg('date') || addDays(new Date().toISOString().slice(0, 10), DAYS_AHEAD);
  const count = Number(arg('count') ?? 1);
  if (!isValidDate(start)) throw new Error(`Invalid --date ${start} (expected YYYY-MM-DD)`);
  if (!Number.isInteger(count) || count < 1 || count > 31) throw new Error('--count must be 1-31');
  const dryRun = process.argv.includes('--dry-run');
  const skipReview = process.argv.includes('--no-review');
  const contentFile = arg('content') ?? arg('revise');
  if (contentFile) {
    if (!skipReview && !process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set: the review pass needs it (or pass --no-review to publish as not reviewed)');
    }
    const manual = readJson<ManualContent>(contentFile);
    if (arg('revise')) {
      for (const date of Object.keys(manual.days).sort()) await revise(date, manual, skipReview, dryRun);
    } else {
      for (let i = 0; i < count; i++) await publishManual(addDays(start, i), manual, skipReview, dryRun);
    }
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  for (let i = 0; i < count; i++) await publish(addDays(start, i), dryRun);
}

await main();
