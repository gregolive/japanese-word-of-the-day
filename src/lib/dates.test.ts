import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, daysBetween, formatLong, isValidDate, localToday } from './dates.ts';

describe('dates', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TZ;
  });

  it('validates real calendar dates only', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2025-02-29')).toBe(false);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-1-01')).toBe(false);
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // US DST change
    expect(daysBetween('2026-10-12', '2026-11-10')).toBe(29);
  });

  it('formats dates without timezone drift', () => {
    expect(formatLong('2026-11-10')).toBe('Tuesday, November 10, 2026');
  });

  it("uses the visitor's local date, not UTC", () => {
    vi.useFakeTimers();
    // 23:30 UTC on Nov 10 is already Nov 11 in Tokyo, still Nov 10 in New York.
    vi.setSystemTime(new Date('2026-11-10T23:30:00Z'));
    process.env.TZ = 'Asia/Tokyo';
    expect(localToday()).toBe('2026-11-11');
    process.env.TZ = 'America/New_York';
    expect(localToday()).toBe('2026-11-10');
  });
});
