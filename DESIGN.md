# DESIGN.md

Approved design for 今日のことば / Japanese Word of the Day ("looks good" on draft 2). The visual source of truth is the design canvas: https://claude.ai/artifact/6c4322fa-2e71-47de-a71b-7d885ebbd48f (boards: Main, Mobile, Archive, ArchiveMobile). This file records the decisions so they live in the repo.

## Principles
Minimal, calm, typographic. The Japanese word is the hero. Neutral surfaces, one vermilion accent, generous spacing. Learner-friendly: furigana on demand, no romaji.

## Tokens
Defined in `src/styles/global.css`.

| Token | Light | Dark |
|---|---|---|
| bg | `#FBFBFA` | `#111214` |
| surface | `#FFFFFF` | `#1A1B1E` |
| fg (text) | `#1B1B1A` | `#EDEDEB` |
| muted | `#5F5F5B` | `#A3A3A0` |
| line (border) | `#E6E5E1` | `#2C2D31` |
| accent | `#B93A26` | `#F07A62` |
| accent-soft | `#FBEAE6` | `#2E1D19` |
| chip | `#F1F0EC` | `#232428` |
| on-accent | `#FFFFFF` | `#111214` |

Fonts: Inter (UI), Noto Sans JP (body Japanese), Noto Serif JP (headword, wordmark). Weights: Inter 400/500/600, Noto Sans JP 400/500/700, Noto Serif JP 500/700.

Shape: cards `rounded-2xl` with 1px `line` border on `surface`; controls are pills (`rounded-full`). No shadows.

## Today screen
Max width 960px, side padding 48px desktop / 20px mobile.
1. **Header:** wordmark 今日のことば (Noto Serif JP, 22px bold) with "Word of the Day" in muted small text; right side: `ふりがな On/Off` pill toggle, then a round dark-mode button (moon in light, sun in dark). Furigana toggle exists on this screen only.
2. **Date row:** long date ("Tuesday, November 10, 2026") in muted text; "Archive ›" link on the right in accent.
3. **Headword:** Noto Serif JP bold, 144px desktop / 104px mobile (shrinks to fit long words on one line), with a round speaker button beside it. Reading below in accent (36px / 28px).
4. **Chips:** part of speech (Noun, Suru verb) and "JLPT N4 (approx.)" on `chip` background. A day whose `generated_by.verified` is not `true` also gets an `accent-soft` chip ("Sample data, not verified" / "Not verified"), and the sentence footnote becomes "These example sentences have not been checked yet."
5. **Meaning card:** title, a segmented control **English | 日本語**, the definition text. English shows glosses ("Also: promise, agreement..."). 日本語 shows an AI-written simple-Japanese definition with furigana segments and the note "AI-written definition in simple Japanese." The 日本語 option is hidden if a day has no JA definition. Choice persists (`defLang`).
6. **Example sentences card:** title, segmented control **Beginner | Intermediate | Advanced** (persists as `tier`), a one-line caption for the tier ("N5-N4 grammar and vocabulary"), then 2 sentences: speaker button, large Japanese (with furigana), English translation in muted small text. Footnote: "AI-generated sentences, checked against dictionary data."
7. **Footer:** attribution (JMdict/EDRDG, Tatoeba, AI-generated note, levels approximate).

### Segmented controls
Track: `chip` background, 1px `line` border, pill, 4px padding. Active segment: `accent` fill with `on-accent` text. Inactive: transparent, `muted` text. Segment height 38px mobile / 44px desktop. On mobile the tier selector is full width on its own row with equal-width segments.

### Furigana behaviour
Words with a reading are buttons. Reading (`<rt>`) is hidden by default and appears on hover (devices with a real pointer only, so touch taps aren't stuck open), keyboard focus, or tap (tap toggles `aria-pressed`). Global `ふりがな` toggle adds `furigana-all` on `<html>` to show all readings; persists as `furigana`. Hover/open state tints the word with `accent-soft`.

## Archive screen
- "‹ Today's word" link (accent), page title "Archive".
- Search input (matches word, reading, meaning) and level chips: All levels, N5, N4, N3, N2, N1. Active chip = accent fill.
- List grouped by month headings (small uppercase muted). Desktop row grid: date ("Mon, Nov 9") | word (serif 24px bold) + reading (accent, small) | meaning | level pill. Mobile: stacked; the date line carries the level ("Mon, Nov 9 · N4"); level pill hidden. Rows link to `/?date=YYYY-MM-DD`; hover tints with `accent-soft`.
- **Paged by 30 days** with "‹ Newer" and "Older ›" buttons and a centered label ("Oct 12 – Nov 10 · page 1 of 3"). Searching or filtering by level ignores paging and searches everything.
- Only dates before the visitor's local today appear (today's word is the home page).
- Empty state: large "見つかりません" and "No words match your search."

## States
- Missing day file: show the newest available word with a soft banner ("Today's word isn't published yet. Showing the most recent one.").
- `?date=` with no file: message "There is no word for YYYY-MM-DD."
- Loading: headword shows a blank placeholder; avoid spinners.
- Dark mode initial state must apply before first paint (no flash).

## Mobile notes (decisions from review)
Toggles are smaller on mobile than desktop; the tier selector was fixed to be full width with equal segments; an Archive link is always visible in the date row.

## Out of scope for v1
Calendar view, favorites/streaks, accounts, romaji, social sharing, custom domain.
