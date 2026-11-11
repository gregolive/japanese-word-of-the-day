import type { ArchiveEntry, DailyWord, Tier } from '../lib/types';
import { url } from '../lib/paths';
import { formatLong, isValidDate, localToday } from '../lib/dates';
import {
  el,
  fetchJson,
  icon,
  initFurigana,
  initTheme,
  load,
  playAudio,
  renderSegments,
  save,
  segButton,
  setSegActive,
} from '../lib/ui';

initTheme();
initFurigana();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const TIERS: { id: Tier; label: string; caption: string }[] = [
  { id: 'beginner', label: 'Beginner', caption: 'N5–N4 grammar and vocabulary' },
  { id: 'intermediate', label: 'Intermediate', caption: 'N3–N2 grammar and vocabulary' },
  { id: 'advanced', label: 'Advanced', caption: 'N1 and beyond: nuance and formal register' },
];

const dataUrl = (path: string) => url(`data/${path}`);
const audioUrl = (path?: string) => (path ? dataUrl(path) : undefined);

function setStatus(message: string): void {
  const status = $('status');
  status.textContent = message;
  status.classList.toggle('hidden', !message);
}

function render(day: DailyWord): void {
  $('date-label').textContent = formatLong(day.date);
  const headword = $('headword');
  headword.textContent = day.word.text;
  // Lets the CSS shrink long words so they stay on one line on narrow screens.
  headword.style.setProperty('--chars', String(Array.from(day.word.text).length));
  $('reading').textContent = day.word.reading;
  document.title = `${day.word.text} (${day.word.reading}) · 今日のことば`;

  const speak = $('speak-word');
  speak.replaceChildren(icon('speaker'));
  speak.onclick = () => playAudio(day.word.text, audioUrl(day.word.audio));

  const chips = $('chips');
  chips.replaceChildren();
  const chipClass = 'rounded-full bg-chip px-3 py-1 text-sm font-medium';
  for (const pos of day.word.pos) chips.append(el('span', { class: chipClass, text: pos }));
  if (day.word.jlpt) {
    chips.append(el('span', { class: chipClass, text: `JLPT ${day.word.jlpt} (approx.)` }));
  }

  // Never present unchecked content (e.g. sample data) as verified.
  const verified = day.generated_by?.verified === true;
  if (!verified) {
    const label = day.generated_by?.model === 'sample-data' ? 'Sample data, not verified' : 'Not verified';
    chips.append(el('span', { class: 'rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent', text: label }));
  }
  const dictionaryOnly = day.generated_by?.model === 'jmdict-only';
  $('sentences-note').textContent = dictionaryOnly
    ? 'Today’s entry comes straight from the dictionary, without AI-written content.'
    : verified
      ? 'AI-generated sentences, checked against dictionary data.'
      : 'These example sentences have not been checked yet.';

  renderMeaning(day);
  renderSentences(day);
}

/* ---------- meaning: English / 日本語 ---------- */

function renderMeaning(day: DailyWord): void {
  const toggle = $('def-toggle');
  const text = $('meaning-text');
  const glosses = $('glosses');
  toggle.replaceChildren();

  const hasJa = !!day.definition_ja?.segments?.length;
  let mode: 'en' | 'ja' = hasJa && load('defLang') === 'ja' ? 'ja' : 'en';

  const show = () => {
    text.replaceChildren();
    if (mode === 'ja' && day.definition_ja) {
      text.classList.add('font-jp');
      text.lang = 'ja';
      text.append(renderSegments(day.definition_ja.segments));
      glosses.textContent = 'AI-written definition in simple Japanese.';
    } else {
      text.classList.remove('font-jp');
      text.removeAttribute('lang');
      text.textContent = day.definition_en;
      glosses.textContent = day.glosses?.length ? `Also: ${day.glosses.join(', ')}` : '';
    }
    for (const [key, button] of buttons) setSegActive(button, key === mode);
  };

  const pad = 'px-3.5 sm:px-[18px]';
  const buttons = new Map<'en' | 'ja', HTMLButtonElement>();
  const make = (key: 'en' | 'ja', label: string) => {
    const button = segButton(label, pad, () => {
      mode = key;
      save('defLang', key);
      show();
    });
    buttons.set(key, button);
    toggle.append(button);
  };
  make('en', 'English');
  if (hasJa) make('ja', '日本語');
  show();
}

/* ---------- sentences by tier ---------- */

function renderSentences(day: DailyWord): void {
  const toggle = $('tier-toggle');
  const caption = $('tier-caption');
  const list = $('sentences');
  toggle.replaceChildren();

  const available = TIERS.filter((tier) => day.sentences[tier.id]?.length);
  if (!available.length) {
    list.replaceChildren(el('li', { class: 'text-muted', text: 'No example sentences for this word yet.' }));
    caption.textContent = '';
    return;
  }

  const saved = load('tier') as Tier | null;
  let current: Tier = available.find((t) => t.id === saved)?.id ?? available[0].id;
  const buttons = new Map<Tier, HTMLButtonElement>();

  const show = () => {
    const tier = TIERS.find((t) => t.id === current)!;
    caption.textContent = tier.caption;
    list.replaceChildren();
    for (const sentence of day.sentences[current] ?? []) {
      const speak = el('button', {
        class:
          'inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-accent sm:size-11',
        attrs: { type: 'button', 'aria-label': 'Hear this sentence' },
      });
      speak.append(icon('speaker'));
      const plain = sentence.segments.map(([text]) => text).join('');
      speak.addEventListener('click', () => playAudio(plain, audioUrl(sentence.audio)));

      const jp = el('p', { class: 'font-jp text-xl leading-[2.2] sm:text-2xl', attrs: { lang: 'ja' } });
      jp.append(renderSegments(sentence.segments));
      const body = el('div', { class: 'flex flex-col gap-1' }, [jp, el('p', { class: 'text-sm text-muted', text: sentence.en })]);
      list.append(el('li', { class: 'flex items-start gap-3' }, [speak, body]));
    }
    for (const [key, button] of buttons) setSegActive(button, key === current);
  };

  for (const tier of available) {
    const button = segButton(tier.label, 'flex-1 px-1 sm:flex-none sm:px-[18px]', () => {
      current = tier.id;
      save('tier', tier.id);
      show();
    });
    buttons.set(tier.id, button);
    toggle.append(button);
  }
  show();
}

/* ---------- load the right day ---------- */

async function main(): Promise<void> {
  const requested = new URLSearchParams(location.search).get('date');
  const explicit = requested && isValidDate(requested) ? requested : null;
  const date = explicit ?? localToday();

  let day = await fetchJson<DailyWord>(`daily/${date}.json`, dataUrl);
  if (day) {
    render(day);
    return;
  }

  // Fallback for visitors whose date has no file yet: show the newest available word.
  // The daily job publishes ahead (UTC date + 2), so skip entries dated after the visitor's today.
  if (!explicit) {
    const archive = await fetchJson<ArchiveEntry[]>('archive.json', dataUrl);
    const latest = (archive ?? [])
      .filter((entry) => entry.date <= date)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (latest) {
      day = await fetchJson<DailyWord>(`daily/${latest.date}.json`, dataUrl);
      if (day) {
        setStatus("Today's word isn't published yet. Showing the most recent one.");
        render(day);
        return;
      }
    }
  }
  setStatus(
    explicit
      ? `There is no word for ${explicit}.`
      : "Couldn't load today's word. Please try again later.",
  );
  $('headword').textContent = '—';
  $('speak-word').hidden = true;
  $('meaning-card').hidden = true;
  $('examples-card').hidden = true;
}

void main();
