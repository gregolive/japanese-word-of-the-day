# 今日のことば · Japanese Word of the Day

A free static site that shows one Japanese word per calendar date, with readings, English or simple-Japanese definitions, and example sentences at three difficulty levels. Built with Astro and Tailwind, hosted on GitHub Pages.

## Run locally

```sh
npm install
npm run dev      # http://localhost:4321/japanese-word-of-the-day/
npm run build
```

Commit the generated `package-lock.json` after the first `npm install`.

## Deploy (GitHub Pages)

1. Push to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The `Deploy` workflow builds and publishes the site at `https://gregolive.github.io/japanese-word-of-the-day/`.

## Data

Each day is a static file, `public/data/daily/YYYY-MM-DD.json`, and `public/data/archive.json` lists every published day (newest first). The browser works out the visitor's **local** date and loads that day's file. If it doesn't exist yet, the site shows the newest available word.

The current files are **sample data** (`generated_by.model = "sample-data"`). The daily agent that creates real entries is the next step, and needs an `ANTHROPIC_API_KEY` repository secret (**Settings → Secrets and variables → Actions**).

## Attribution

- Dictionary data: [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html), © EDRDG, used under the [EDRDG licence](https://www.edrdg.org/edrdg/licence.html).
- Reference sentences: [Tatoeba](https://tatoeba.org), CC BY 2.0 FR.
- Japanese definitions and example sentences are AI-generated. JLPT levels are approximate.
