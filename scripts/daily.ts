/**
 * Publish the word for a date: public/data/daily/<date>.json + archive.json + state/used.json.
 *
 *   node scripts/daily.ts                         # date = UTC today + 2 (see CLAUDE.md)
 *   node scripts/daily.ts --date 2026-11-12       # a specific date
 *   node scripts/daily.ts --date 2026-11-05 --count 7   # a run of consecutive dates (backfill)
 *   node scripts/daily.ts --dry-run               # generate and check, print, write nothing
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
import { getTokenizer, type Target } from './lib/tokenizer.ts';
import { TIERS, validate, type Checked } from './lib/validate.ts';

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

function baseRecord(date: string, entry: PoolEntry): DailyWord {
  const [main, ...rest] = entry.senses;
  const also = rest.flat().filter((g) => !main.includes(g)).slice(0, 6);
  return {
    date,
    word: { text: entry.text, reading: entry.reading, pos: entry.pos, jlpt: entry.jlpt, jmdict_id: entry.id },
    definition_en: main.join('; '),
    ...(also.length ? { glosses: also } : {}),
    sentences: {},
  };
}

function aiRecord(date: string, entry: PoolEntry, checked: Checked): DailyWord {
  const record = baseRecord(date, entry);
  record.definition_ja = { segments: checked.definitionSegments, source: 'ai' };
  for (const tier of TIERS) record.sentences[tier] = checked.sentences[tier];
  record.generated_by = { model: GENERATE_MODEL, verified: true };
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
  const attemptLog: string[][] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !checked; attempt++) {
    try {
      const gen = await generate(entry, feedback);
      addUsage(gen.usage);
      const result = validate(gen.generated, target, tokenizer);
      if (result.problems.length) {
        feedback = result.problems;
      } else {
        const rev = await review(entry, gen.generated);
        addUsage(rev.usage);
        if (rev.review.pass) checked = result.checked;
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

  const record = checked ? aiRecord(date, entry, checked) : fallbackRecord(date, entry);
  const outcome = checked ? 'ai' : 'fallback';
  if (!checked) console.log(`::warning::${date}: AI content failed ${MAX_ATTEMPTS} times; published dictionary-only content`);

  if (dryRun) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  // Advance the cursor first: if a later write fails, the word is skipped, never repeated.
  writeJson(USED, { cursor: used.cursor + 1, history: [...used.history, { date, id: entry.id }] });
  writeJson(dailyPath(date), record);
  const removed = removeSampleData();
  updateArchive(
    { date, text: entry.text, reading: entry.reading, meaning: entry.senses[0].slice(0, 2).join('; '), jlpt: entry.jlpt },
    removed,
  );
  logRun({
    date,
    word: entry.text,
    id: entry.id,
    outcome,
    attempts: attemptLog.length + (checked ? 1 : 0),
    model: GENERATE_MODEL,
    verify_model: VERIFY_MODEL,
    ...tokens,
    ...(attemptLog.length ? { problems: attemptLog } : {}),
  });
  console.log(`  published (${outcome}); tokens in ${tokens.input_tokens}, out ${tokens.output_tokens}`);
  if (removed.length) console.log(`  removed sample data for ${removed.join(', ')}`);
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
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');

  for (let i = 0; i < count; i++) await publish(addDays(start, i), process.argv.includes('--dry-run'));
}

await main();
