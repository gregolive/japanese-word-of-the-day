# CLAUDE.md

Guidance for Claude Code working in this repo. Read `PLAN.md` for what to build and `DESIGN.md` for how it should look.

## What this is
**今日のことば / Japanese Word of the Day**: a free static site (Astro + Tailwind, GitHub Pages) that shows one Japanese word per calendar date. A daily GitHub Actions job uses the Claude API to write the day's record. There is no backend and there are no accounts.

- Repo: `gregolive/japanese-word-of-the-day` (public)
- Site: https://gregolive.github.io/japanese-word-of-the-day/ (`base` is `/japanese-word-of-the-day`)
- Owner is a learner, not a native speaker: Japanese content must be checked by code, not trusted.

## Commands
```sh
npm install
npm run dev       # http://localhost:4321/japanese-word-of-the-day/
npm run build     # static output in dist/
npm run preview
npm test          # Vitest (scripts/**/*.test.ts, src/**/*.test.ts)
npm run check     # astro check: types for src/ and scripts/
npm run ingest    # rebuild the word pool (refuses without --force; reorders words!)
npm run daily -- --date YYYY-MM-DD [--count N] [--dry-run]   # needs ANTHROPIC_API_KEY
npm run daily -- --content f.json | --revise f.json [--no-review]   # hand-written content; --no-review marks it reviewed:false
```
Node >= 22.18 (`.nvmrc`): scripts are TypeScript run directly by Node (type stripping), so use only erasable syntax (no enums, no parameter properties) and import with `.ts` extensions.

## Stack and layout
- Astro ^5 (pinned: Astro 6 + `@tailwindcss/vite` had a build failure), TypeScript strict, Tailwind v4 via `@tailwindcss/vite`.
- Tailwind v4 is CSS-first: tokens live in `src/styles/global.css` (`:root` / `.dark` variables mapped in `@theme inline`). There is no `tailwind.config.js`. Use token classes (`bg-bg`, `text-muted`, `border-line`, `bg-accent`, ...), never raw hex in components.
- Dark mode = `.dark` class on `<html>`, set by an inline script in `src/layouts/Base.astro` before paint (localStorage `theme`, else system preference).

```
src/pages/        index.astro (today), archive.astro
src/components/   Header.astro, Footer.astro
src/layouts/      Base.astro
src/scripts/      word-page.ts, archive-page.ts   (client DOM rendering)
src/lib/          types.ts, dates.ts, paths.ts, ui.ts
public/data/      archive.json, daily/YYYY-MM-DD.json   (the content)
scripts/          ingest.ts (word pool), daily.ts (daily agent); lib/ = pure, tested helpers
state/            pool.json (shuffled pool, committed), used.json (cursor + history), runs.jsonl (run log)
.github/workflows deploy.yml (Pages), daily.yml (04:00 UTC cron + manual backfill)
```

## Conventions
- **Always build URLs with `url()` from `src/lib/paths.ts`** (base path!). Never hardcode `/data/...` or `/archive`.
- **Dates are `YYYY-MM-DD` strings.** Use helpers in `src/lib/dates.ts` (UTC math, no timezone drift). The visitor's *local* date picks the word; never use `toISOString()` for "today" in the browser.
- **Client rendering uses the `el()` helper and `textContent`.** Do not use `innerHTML` with data from JSON. Static icon strings in `ui.ts` are the only exception.
- Furigana is data, not computed in the browser: text is `Segment[] = [text, reading][]`, `reading` is `""` when none. Never ask the LLM to produce readings; generate them in code (see PLAN.md).
- No romaji anywhere. No accounts, analytics, cookies, or third-party scripts beyond Google Fonts.
- Keep it minimal: no UI framework, no state library. Add a dependency only when it removes real complexity.
- Accessibility baseline: real `<button>`s, `aria-pressed` on toggles, visible focus, 44px targets on desktop / 38px+ on mobile controls, AA contrast in both themes.
- Match `DESIGN.md`. If you need to deviate, say so and update `DESIGN.md` in the same change.

## Data rules (important)
- `public/data/daily/*.json` must conform to `DailyWord` in `src/lib/types.ts`. Change the type and the data together.
- `public/data/archive.json` is newest-first and must contain exactly one entry per published daily file.
- Sample data (`generated_by.model = "sample-data"`) is shown as unverified and is deleted automatically by the first real `daily.ts` run. Real entries need `verified: true`; `generated_by.model = "jmdict-only"` is the no-AI fallback.
- Pushes made with `GITHUB_TOKEN` don't trigger other workflows, so `daily.yml` starts `deploy.yml` itself with `gh workflow run`.
- The cron job publishes for **UTC date + 2** so every timezone (up to UTC+14) has its file ahead of time. Do not "simplify" this to today's date.
- Never publish a Japanese sentence that failed a deterministic check (see PLAN.md, Validation). On repeated failure, fall back to a non-AI pick rather than shipping unchecked text.

## Licences and attribution (don't break these)
- JMdict/EDRDG: attribution required, footer already has it. Keep it.
- Tatoeba: CC BY 2.0 FR; if any real Tatoeba sentence is shown, attribute it per sentence.
- JLPT levels are unofficial; always label them "approx."
- AI-written definitions and sentences are always labelled as AI-generated in the UI.

## Secrets and safety
- `ANTHROPIC_API_KEY` lives only in GitHub Actions secrets. Never commit keys; `.env*` is gitignored.
- The Claude chat session that scaffolded this repo cannot run installs or builds, so everything has been unverified until run locally. Verify with `npm run build` before declaring done.

## Git
- Small commits on feature branches, PRs into `main`. Pushing to `main` deploys.
- Scheduled workflows in public repos can be auto-disabled after ~60 days of repo inactivity. The daily job commits data, which counts as activity, but keep the keep-alive guard from PLAN.md.

## Known issues
- "Cannot find native binding" / missing `tailwindcss-oxide.*.node`: caused by an old Node (Tailwind's oxide needs Node >= 20) plus the npm optional-dependency bug. Use Node 22 (`.nvmrc`; Homebrew `node@22` is keg-only, so put `/opt/homebrew/opt/node@22/bin` first on PATH), then `rm -rf node_modules package-lock.json && npm install`.
- `npm run build` passes on Node 22. Visual check against DESIGN.md and the first Pages deploy are still to do.
- `.github/workflows/deploy.yml` was added by hand (the scaffolding tool couldn't write that path).
