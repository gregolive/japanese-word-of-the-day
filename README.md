# 今日のことば · Japanese Word of the Day

A free static site that shows one Japanese word per calendar date, with readings, English or simple-Japanese definitions, and example sentences at three difficulty levels. Built with Astro and Tailwind, hosted on GitHub Pages.

## Run locally

```sh
npm install
npm run dev      # http://localhost:4321/japanese-word-of-the-day/
npm run build
npm test         # unit tests (Vitest)
npm run check    # type check
```

Needs Node 22.18 or newer (`.nvmrc`); the scripts run TypeScript directly with Node.

## Deploy (GitHub Pages)

1. Push to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The `Deploy` workflow builds and publishes the site at `https://gregolive.github.io/japanese-word-of-the-day/`.

## Data

Each day is a static file, `public/data/daily/YYYY-MM-DD.json`, and `public/data/archive.json` lists every published day (newest first). The browser works out the visitor's **local** date and loads that day's file. If it doesn't exist yet, the site shows the newest available word.

## How the daily word is made

1. **Word pool** (`npm run ingest`, run once): downloads JMdict common words (via [jmdict-simplified](https://github.com/scriptin/jmdict-simplified)) and the JLPT lists, keeps learner-friendly words on a JLPT list, and shuffles them with a fixed seed into `state/pool.json`. `state/used.json` is the cursor, so words never repeat.
2. **Daily job** (`.github/workflows/daily.yml`, 04:00 UTC): runs `scripts/daily.ts` for **UTC date + 2**, so the file exists before the earliest time zone reaches that date.
   - Claude (`claude-haiku-5-5` by default) writes a simple-Japanese definition and 2 example sentences for each of Beginner, Intermediate and Advanced, as structured JSON.
   - Code checks everything: a Japanese tokenizer (kuromoji) confirms each sentence really uses the word, plus length limits, no romaji, allowed characters and a blocklist.
   - A second Claude call reviews naturalness and correctness. Only content that passes both is published (`verified: true`).
   - Furigana readings come from the tokenizer, never from the model; the word's own reading comes from JMdict.
   - After 3 failed attempts the day falls back to dictionary-only content (no AI text).
   - The job commits the data, starts the Pages deploy, and opens a GitHub issue if it fails.
3. Each run is logged (model, tokens, attempts, outcome) in `state/runs.jsonl`.

### Running it

- **Backfill or re-run:** Actions → **Daily word** → **Run workflow**, with an optional start date and number of days. Tick **dry run** to see the output without committing.
- **Locally:** `ANTHROPIC_API_KEY=... npm run daily -- --date 2026-11-12 --dry-run`.
- **Change model:** set repository variables `CLAUDE_MODEL` / `CLAUDE_VERIFY_MODEL` (**Settings → Secrets and variables → Actions → Variables**). Default is `claude-haiku-5-5` for both.
- **Cost:** with Haiku, a few hundredths of a dollar per month at list prices. Check `state/runs.jsonl` for real token counts.

The API key lives only in the `ANTHROPIC_API_KEY` repository secret.

## Attribution

- Dictionary data: [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html), © EDRDG, used under the [EDRDG licence](https://www.edrdg.org/edrdg/licence.html).
- Reference sentences: [Tatoeba](https://tatoeba.org), CC BY 2.0 FR.
- JLPT levels: [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) (MIT). There is no official JLPT vocabulary list, so levels are approximate.
- Japanese tokenizer: [kuromoji](https://github.com/takuyaa/kuromoji.js) (Apache-2.0) with the IPADIC dictionary.
- Japanese definitions and example sentences are AI-generated.
