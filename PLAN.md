# PLAN.md

What to build, in order. Context lives in `CLAUDE.md` (conventions) and `DESIGN.md` (UI). Planning history is in the Claude.ai Project "Japanese Word of the Day" (`plan/initial-plan.md`, `plan/decisions-and-costs.md`).

## Status
- Done: UI design (approved), Astro + Tailwind scaffold with Today and Archive pages, sample data, README. Builds on Node 22; not yet checked visually or deployed.
- Not done: everything under Milestones 1 onward.

## Product spec (confirmed)
- One global word per calendar date; each visitor sees the word for their local date. Static site on GitHub Pages, free. No accounts, no backend.
- Word shows: kanji/kana, reading, part of speech, approx. JLPT level, English definition, AI-written simple-Japanese definition (toggle), example sentences in 3 tiers (Beginner N5-N4, Intermediate N3-N2, Advanced N1+), 2 per tier, furigana on hover/tap plus global toggle, no romaji, audio per word and sentence.
- Words are chosen **randomly with no repeats**: shuffle the JMdict pool once with a fixed seed and consume sequentially (`state/used.json` tracks the cursor). Pool is mixed across levels.
- Archive: list of past words, paginated by 30 days (done in the client).
- Budget: about $1-3/month on the Claude API is accepted. Everything else free.

## Architecture
```
GitHub Actions cron (~04:00 UTC daily)
  -> scripts/daily.ts
       pick next word from pool (seeded shuffle, state/used.json)
       gather facts: JMdict entry, Tatoeba examples
       call Claude: definitions + sentences per tier (structured JSON)
       validate deterministically; verify with a second Claude pass
       generate furigana segments in code
       (later) generate TTS audio
       write public/data/daily/<UTC date + 2>.json, update public/data/archive.json, state/used.json
  -> commit + push -> deploy.yml publishes Pages
Browser: computes local date -> fetches data/daily/<date>.json (fallback: newest available)
```
Publishing **UTC date + 2** guarantees the file exists before UTC+14 reaches that date (about 30 hours of slack).

## Milestones

### 0. Get the scaffold running (do first)
- [x] `npm install` works locally (see CLAUDE.md Known issues if "Cannot find native binding"). Commit `package-lock.json`.
- [x] `npm run build` passes; fix any type or build errors in the scaffold.
- [ ] Run `npm run dev` and compare against `DESIGN.md` on desktop and a ~390px mobile viewport, light and dark. Fix deviations.
- [ ] Confirm `.github/workflows/deploy.yml` is present, set repo Settings -> Pages -> Source to GitHub Actions, push, and confirm the live site loads with correct base path (fonts, favicon, `data/` fetches, Archive link, `?date=`).
- [ ] Check keyboard use and screen-reader labels on all toggles.

### 1. Word pool (ingest)
- [ ] `scripts/ingest.ts`: download latest jmdict-simplified JSON (EDRDG licence), keep learner-appropriate entries (common words, exclude names, obscure/archaic/vulgar tags, katakana-only oddities, very long entries).
- [ ] Attach approximate JLPT levels from a clearly-licensed community list; mark unknowns as `null` (treated as Intermediate). Record the list's source and licence in the README.
- [ ] Output `state/pool.json` (ids only is fine) in a seeded shuffled order and an empty `state/used.json` cursor. Deterministic with a fixed seed. Add a unit test.
- [ ] Keep large raw downloads out of git (gitignored); commit only the compact pool.

### 2. Daily agent
- [ ] `scripts/daily.ts` implementing the architecture above. Model configurable via env (default a Haiku-class model; Sonnet-class for verification if needed). Use structured output / tool use so the response is parseable JSON, not free text.
- [ ] Prompt rules: sentences must naturally contain the target word in a valid form; tier grammar/vocabulary limits; one clear context per sentence; no names of real people, no sensitive topics; English translation per sentence; simple-Japanese definition (<= ~2 short sentences, N4-level vocabulary).
- [ ] **Validation (deterministic, in code):** tokenizer (e.g. kuromoji or sudachi-based) confirms the target word's lemma appears in each sentence; reading matches JMdict; length limits per tier; no romaji; no disallowed characters; profanity/blocklist; exactly 2 sentences for every included tier; tiers easier than the word's level are skipped. Fail -> retry (max 3) -> fall back to a non-AI pick (JMdict gloss + Tatoeba examples marked as such).
- [ ] **Verification pass:** a separate Claude call reviews naturalness and correctness and returns pass/fail with reasons; only `verified: true` records are published.
- [ ] **Furigana in code:** produce `Segment[]` with the tokenizer's readings; for kanji+okurigana split so ruby covers kanji only. Never trust the LLM for readings.
- [ ] Idempotent: re-running for a date that already has a file does nothing. Log each run (model, tokens, retries, outcome) to `state/runs.jsonl` (keep it small).
- [ ] Update `public/data/archive.json` (newest first, one entry per file) and `state/used.json` atomically.

### 3. Scheduling workflow
- [ ] `.github/workflows/daily.yml`: `schedule` (cron around 04:00 UTC) plus `workflow_dispatch` with an optional date input. Secret `ANTHROPIC_API_KEY`. Permissions `contents: write`. Commits with the actions bot and pushes to `main`.
- [ ] Concurrency group so two runs can't overlap.
- [ ] Failure handling: if the job fails, open/update a GitHub issue (or fail loudly) so the owner notices before the date arrives.
- [ ] Keep-alive guard against the ~60 day auto-disable of scheduled workflows (data commits normally count; add a fallback keep-alive commit if there has been no commit in 45 days).
- [ ] Backfill a few days of real words (with `workflow_dispatch`) so the archive isn't sample data. Delete the sample files once real ones exist.

### 4. Audio
- [ ] v1 (already in place): Web Speech API, `ja-JP`, rate 0.9. Check it behaves on iOS Safari (needs a user gesture; voices load asynchronously).
- [ ] v1.5: pre-generate MP3s with Google Cloud TTS for the word and each sentence, committed under `public/data/audio/<date>/`; the `audio` fields in `DailyWord` point to them and `playAudio` already prefers them. Verify free-tier limits and billing requirements first. Keep clips small and commit sizes in check.

### 5. Polish and hardening
- [ ] Open Graph/meta tags (done) and a simple share image (todo); `<noscript>` message (done).
- [ ] Offline/cached last word (optional, small service worker) if it stays simple.
- [ ] Lighthouse pass (performance, accessibility).
- [ ] Unit tests for `dates.ts` (timezone edge cases) and the validation functions.
- [ ] README: how the agent works, how to run it locally, cost notes, licences.

## Open questions for the owner
- Confirm 3 tiers x 2 sentences (default) and the tier-skipping rule for hard words.
- Which model tier for generation vs verification once real cost is observed (estimates: Haiku ~$0.07/mo, Sonnet ~$1.45/mo, Opus ~$2.90/mo at ~4k in + 4k out per day).
- Whether to keep the Google Cloud TTS step (needs a billing-enabled Google account) or stay on browser speech.
- A Japanese speaker should spot-check the first batch of generated entries before launch.

## Definition of done for v1
Site is live on Pages, shows a real verified word for every date at least 2 days ahead, the daily job has run unattended for a week, archive has real entries, and attribution is in the footer.
