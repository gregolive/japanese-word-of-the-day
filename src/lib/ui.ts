import type { Segment } from './types';

/* ---------- tiny DOM helper ---------- */

export interface ElProps {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

/* ---------- storage (safe when blocked) ---------- */

export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the setting just won't persist */
  }
}

/* ---------- icons (static strings only) ---------- */

const ICONS = {
  speaker:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
} as const;

export function icon(name: keyof typeof ICONS): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = ICONS[name];
  return template.content.firstElementChild as SVGElement;
}

/* ---------- theme + furigana toggles ---------- */

export function initTheme(): void {
  const button = document.getElementById('theme-toggle');
  const root = document.documentElement;
  const sync = () => button?.setAttribute('aria-pressed', String(root.classList.contains('dark')));
  sync();
  button?.addEventListener('click', () => {
    const dark = !root.classList.contains('dark');
    root.classList.toggle('dark', dark);
    save('theme', dark ? 'dark' : 'light');
    sync();
  });
}

export function initFurigana(): void {
  const button = document.getElementById('furigana-toggle');
  if (!button) return;
  const label = document.getElementById('furigana-state');
  const root = document.documentElement;
  const sync = () => {
    const on = root.classList.contains('furigana-all');
    button.setAttribute('aria-pressed', String(on));
    if (label) label.textContent = on ? 'On' : 'Off';
  };
  sync();
  button.addEventListener('click', () => {
    const on = !root.classList.contains('furigana-all');
    root.classList.toggle('furigana-all', on);
    save('furigana', on ? '1' : '0');
    sync();
  });
}

/* ---------- furigana text ---------- */

/** Words with a reading become buttons: hover/focus shows the reading, a tap pins it. */
export function renderSegments(segments: Segment[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const [text, reading] of segments) {
    if (!reading) {
      fragment.append(el('span', { text }));
      continue;
    }
    const ruby = el('ruby', {}, [text, el('rt', { text: reading })]);
    const button = el('button', { class: 'seg', attrs: { type: 'button', 'aria-pressed': 'false' } }, [ruby]);
    button.addEventListener('click', () => {
      button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    });
    fragment.append(button);
  }
  return fragment;
}

/* ---------- audio ---------- */

/** v1 audio: the browser's built-in Japanese voice (Web Speech API). */
export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** Prefers a pre-generated audio file when the data has one, else falls back to speech. */
export function playAudio(text: string, src?: string): void {
  if (!src) {
    speak(text);
    return;
  }
  new Audio(src).play().catch(() => speak(text));
}

/* ---------- segmented controls ---------- */

export const SEG_BASE =
  'min-h-[38px] cursor-pointer whitespace-nowrap rounded-full text-sm font-semibold sm:min-h-[44px] sm:text-[15px]';

export function setSegActive(button: HTMLElement, active: boolean): void {
  button.setAttribute('aria-pressed', String(active));
  button.classList.toggle('bg-accent', active);
  button.classList.toggle('text-on-accent', active);
  button.classList.toggle('bg-transparent', !active);
  button.classList.toggle('text-muted', !active);
}

export function segButton(label: string, extraClass: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', { class: `${SEG_BASE} ${extraClass}`, text: label, attrs: { type: 'button' } });
  button.addEventListener('click', onClick);
  return button;
}

export async function fetchJson<T>(path: string, makeUrl: (p: string) => string): Promise<T | null> {
  try {
    const response = await fetch(makeUrl(path));
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
