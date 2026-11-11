/**
 * Build the word pool: state/pool.json (seeded shuffle) and state/used.json (cursor).
 *
 *   node scripts/ingest.ts            # refuses to replace an existing pool
 *   node scripts/ingest.ts --force    # rebuild (resets the order; see below)
 *   node scripts/ingest.ts --include-unlisted   # also keep words on no JLPT list (mostly news compounds)
 *
 * Sources (downloads go to .cache/, which is gitignored):
 *   - JMdict common words, English, via jmdict-simplified (EDRDG licence).
 *   - JLPT levels from open-anki-jlpt-decks (MIT). Unofficial: shown as "approx.".
 *
 * Rebuilding reshuffles the pool, so the used.json cursor would point at different words and
 * could repeat past ones. Only rebuild with --force, and expect to reset the cursor.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildJlptLookup, type Jlpt, type JmWord, type PoolEntry, toPoolEntry } from './lib/jmdict.ts';
import { seededShuffle } from './lib/random.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache');
const POOL = join(ROOT, 'state/pool.json');
const USED = join(ROOT, 'state/used.json');

/** Fixed forever: changing it reorders every future word. */
export const SEED = 20261111;

const JMDICT_REPO = 'scriptin/jmdict-simplified';
const JLPT_REPO = 'jamsinclair/open-anki-jlpt-decks';
const LEVELS: Jlpt[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function download(url: string, file: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${res.statusText}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function loadJmdict(): Promise<{ version: string; dictDate: string; words: JmWord[] }> {
  const release = await getJson<{ tag_name: string; assets: { name: string; browser_download_url: string }[] }>(
    `https://api.github.com/repos/${JMDICT_REPO}/releases/latest`,
  );
  const asset = release.assets.find((a) => /^jmdict-eng-common-.*\.json\.tgz$/.test(a.name));
  if (!asset) throw new Error(`No jmdict-eng-common .json.tgz in release ${release.tag_name}`);

  const dir = join(CACHE, release.tag_name);
  mkdirSync(dir, { recursive: true });
  const archive = join(dir, asset.name);
  if (!existsSync(archive)) {
    console.log(`Downloading ${asset.name}`);
    await download(asset.browser_download_url, archive);
  }
  execFileSync('tar', ['-xzf', archive, '-C', dir]);
  const json = readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!json) throw new Error(`No .json inside ${asset.name}`);
  const data = JSON.parse(readFileSync(join(dir, json), 'utf8'));
  return { version: data.version, dictDate: data.dictDate, words: data.words };
}

async function loadJlpt(): Promise<{ commit: string; lookup: Map<string, Jlpt> }> {
  const [{ sha }] = await getJson<{ sha: string }[]>(`https://api.github.com/repos/${JLPT_REPO}/commits?per_page=1`);
  const files: [Jlpt, string][] = [];
  for (const level of LEVELS) {
    const url = `https://raw.githubusercontent.com/${JLPT_REPO}/${sha}/src/${level.toLowerCase()}.csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
    files.push([level, await res.text()]);
  }
  return { commit: sha, lookup: buildJlptLookup(files) };
}

/** Filter JMdict to learner-friendly entries, one per headword, in seeded random order. */
export function buildPool(
  words: JmWord[],
  lookup: Map<string, Jlpt>,
  { seed = SEED, includeUnlisted = false } = {},
): PoolEntry[] {
  const seen = new Set<string>();
  const entries: PoolEntry[] = [];
  for (const word of words) {
    const entry = toPoolEntry(word, lookup);
    if (!entry || seen.has(entry.text)) continue;
    // Words on no JLPT list are mostly specialised news compounds; leave them out by default.
    if (!entry.jlpt && !includeUnlisted) continue; // homographs: keep the first entry only
    seen.add(entry.text);
    entries.push(entry);
  }
  // Sort by id first so the shuffle doesn't depend on the order of the download.
  entries.sort((a, b) => a.id - b.id);
  return seededShuffle(entries, seed);
}

async function main(): Promise<void> {
  if (existsSync(POOL) && !process.argv.includes('--force')) {
    console.error('state/pool.json already exists. Rebuilding reorders the pool; pass --force if you mean it.');
    process.exit(1);
  }
  const [jmdict, jlpt] = await Promise.all([loadJmdict(), loadJlpt()]);
  const includeUnlisted = process.argv.includes('--include-unlisted');
  const entries = buildPool(jmdict.words, jlpt.lookup, { includeUnlisted });

  const byLevel = Object.fromEntries([...LEVELS, null].map((l) => [l ?? 'unknown', entries.filter((e) => e.jlpt === l).length]));
  const pool = {
    meta: {
      seed: SEED,
      includeUnlisted,
      jmdict: { source: `https://github.com/${JMDICT_REPO}`, version: jmdict.version, dictDate: jmdict.dictDate },
      jlpt: { source: `https://github.com/${JLPT_REPO}`, commit: jlpt.commit, licence: 'MIT' },
      count: entries.length,
      byLevel,
    },
    entries,
  };

  mkdirSync(dirname(POOL), { recursive: true });
  // One entry per line: compact, but diffs stay readable.
  const body = entries.map((e) => `    ${JSON.stringify(e)}`).join(',\n');
  writeFileSync(POOL, `{\n  "meta": ${JSON.stringify(pool.meta)},\n  "entries": [\n${body}\n  ]\n}\n`);
  writeFileSync(USED, `${JSON.stringify({ cursor: 0, history: [] }, null, 2)}\n`);
  console.log(`Wrote ${entries.length} words to state/pool.json`, byLevel);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
