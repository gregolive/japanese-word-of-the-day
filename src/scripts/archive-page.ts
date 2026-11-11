import type { ArchiveEntry } from '../lib/types';
import { url } from '../lib/paths';
import { addDays, daysBetween, formatMonthDay, formatShort, localToday, monthLabel } from '../lib/dates';
import { el, fetchJson, initTheme } from '../lib/ui';

initTheme();

const PAGE_DAYS = 30;
const LEVELS = ['All levels', 'N5', 'N4', 'N3', 'N2', 'N1'] as const;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let entries: ArchiveEntry[] = [];
let level: (typeof LEVELS)[number] = 'All levels';
let query = '';
let page = Math.max(1, Math.floor(Number(new URLSearchParams(location.search).get('page'))) || 1);

const today = localToday();

function matches(entry: ArchiveEntry): boolean {
  if (level !== 'All levels' && entry.jlpt !== level) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [entry.text, entry.reading, entry.meaning].some((field) => field.toLowerCase().includes(q));
}

function row(entry: ArchiveEntry): HTMLElement {
  const link = el('a', {
    class:
      'grid grid-cols-1 gap-1 border-b border-line py-4 hover:bg-accent-soft sm:grid-cols-[110px_1.2fr_1.5fr_56px] sm:items-center sm:gap-4 sm:px-2',
    attrs: { href: `${url('')}?date=${entry.date}` },
  });
  // Mobile carries the level on the date line; desktop shows the level pill instead.
  const dateLine = el('span', { class: 'text-sm text-muted', text: formatShort(entry.date) });
  if (entry.jlpt) dateLine.append(el('span', { class: 'sm:hidden', text: ` · ${entry.jlpt}` }));
  link.append(
    dateLine,
    el('span', { class: 'flex items-baseline gap-2', attrs: { lang: 'ja' } }, [
      el('span', { class: 'font-serif-jp text-2xl font-bold', text: entry.text }),
      el('span', { class: 'font-jp text-sm text-accent', text: entry.reading }),
    ]),
    el('span', { class: 'text-[15px]', text: entry.meaning }),
  );
  link.append(
    el('span', {
      class: 'hidden justify-self-end rounded-full bg-chip px-2.5 py-0.5 text-xs font-semibold sm:inline',
      text: entry.jlpt ?? '',
    }),
  );
  return link;
}

function renderList(): void {
  const list = $('list');
  const pager = $('pager');
  list.replaceChildren();
  pager.replaceChildren();

  const past = entries.filter((e) => e.date < today);
  const filtering = query.trim() !== '' || level !== 'All levels';

  let shown: ArchiveEntry[];
  let totalPages = 1;

  if (filtering) {
    // Search and level filters look across every entry; no paging needed.
    shown = past.filter(matches);
  } else {
    // 30-day windows counted back from yesterday: page 1 = last 30 days, page 2 = the 30 before, ...
    const newest = addDays(today, -1);
    const oldest = past.length ? past[past.length - 1].date : newest;
    totalPages = Math.max(1, Math.ceil((daysBetween(oldest, newest) + 1) / PAGE_DAYS));
    page = Math.min(page, totalPages);
    const windowEnd = addDays(newest, -(page - 1) * PAGE_DAYS);
    const windowStart = addDays(windowEnd, -(PAGE_DAYS - 1));
    shown = past.filter((e) => e.date >= windowStart && e.date <= windowEnd);

    renderPager(pager, windowStart, windowEnd, totalPages);
  }

  if (!shown.length) {
    list.append(
      el('div', { class: 'flex flex-col items-center gap-2 py-16 text-center' }, [
        el('p', { class: 'font-jp text-3xl text-muted', text: '見つかりません', attrs: { lang: 'ja' } }),
        el('p', { class: 'text-sm text-muted', text: filtering ? 'No words match your search.' : 'No words yet.' }),
      ]),
    );
    return;
  }

  let currentMonth = '';
  for (const entry of shown) {
    const month = monthLabel(entry.date);
    if (month !== currentMonth) {
      currentMonth = month;
      list.append(
        el('h2', { class: 'pt-6 pb-1 text-xs font-semibold uppercase tracking-wider text-muted', text: month }),
      );
    }
    list.append(row(entry));
  }
}

function renderPager(pager: HTMLElement, start: string, end: string, totalPages: number): void {
  const button = (label: string, target: number, disabled: boolean) => {
    const b = el('button', {
      class:
        'min-h-10 shrink-0 cursor-pointer whitespace-nowrap rounded-full border border-line bg-surface px-4 font-semibold disabled:cursor-default disabled:opacity-40 sm:min-h-11',
      text: label,
      attrs: { type: 'button' },
    });
    b.disabled = disabled;
    b.addEventListener('click', () => {
      page = target;
      const next = new URL(location.href);
      next.searchParams.set('page', String(page));
      history.replaceState(null, '', next);
      renderList();
      window.scrollTo({ top: 0 });
    });
    return b;
  };
  pager.append(
    button('‹ Newer', page - 1, page <= 1),
    el('span', {
      class: 'text-center text-muted',
      text: `${formatMonthDay(start)} – ${formatMonthDay(end)} · page ${page} of ${totalPages}`,
    }),
    button('Older ›', page + 1, page >= totalPages),
  );
}

function renderLevels(): void {
  const wrap = $('levels');
  wrap.replaceChildren();
  for (const name of LEVELS) {
    const active = name === level;
    const chip = el('button', {
      class: `min-h-[38px] cursor-pointer rounded-full border px-3.5 text-sm font-semibold sm:min-h-11 ${
        active ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-muted'
      }`,
      text: name,
      attrs: { type: 'button', 'aria-pressed': String(active) },
    });
    chip.addEventListener('click', () => {
      level = name;
      renderLevels();
      renderList();
    });
    wrap.append(chip);
  }
}

async function main(): Promise<void> {
  $<HTMLInputElement>('search').addEventListener('input', (event) => {
    query = (event.target as HTMLInputElement).value;
    renderList();
  });
  renderLevels();

  const data = await fetchJson<ArchiveEntry[]>('archive.json', (p) => url(`data/${p}`));
  entries = (data ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  renderList();
}

void main();
