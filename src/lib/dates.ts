const pad = (n: number) => String(n).padStart(2, '0');
const utc = (s: string) => new Date(`${s}T00:00:00Z`);

/** The visitor's LOCAL calendar date as YYYY-MM-DD (this is what picks the day's word). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True only for a real calendar date (rejects 2026-02-30, which Date would roll over to Mar 2). */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = utc(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

export function addDays(s: string, n: number): string {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' });

const LONG = fmt({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const SHORT = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const MONTH_DAY = fmt({ month: 'short', day: 'numeric' });
const MONTH = fmt({ month: 'long', year: 'numeric' });

export const formatLong = (s: string) => LONG.format(utc(s)); // Tuesday, November 10, 2026
export const formatShort = (s: string) => SHORT.format(utc(s)); // Mon, Nov 9
export const formatMonthDay = (s: string) => MONTH_DAY.format(utc(s)); // Nov 9
export const monthLabel = (s: string) => MONTH.format(utc(s)); // November 2026
