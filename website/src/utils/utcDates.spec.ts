import { DateTime, Settings } from 'luxon';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { dateTimeInMonths, utcToday } from './utcDates.ts';

// Zones that are a fixed offset from UTC all year round, so the tests don't depend on daylight saving.
const bangkok = 'Asia/Bangkok'; // UTC+7
const honolulu = 'Pacific/Honolulu'; // UTC-10

const freezeTime = (isoInstant: string, zone: string) => {
    Settings.defaultZone = zone;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoInstant));
};

afterEach(() => {
    vi.useRealTimers();
    Settings.defaultZone = 'system';
});

describe('utcToday', () => {
    test('returns the UTC date when the local date is already a day ahead', () => {
        freezeTime('2026-07-19T20:00:00Z', bangkok); // 03:00 on 20 July in Bangkok

        expect(utcToday().toFormat('yyyy-MM-dd')).toBe('2026-07-19');
    });

    test('returns the UTC date when the local date is still a day behind', () => {
        freezeTime('2026-07-20T05:00:00Z', honolulu); // 19:00 on 19 July in Honolulu

        expect(utcToday().toFormat('yyyy-MM-dd')).toBe('2026-07-20');
    });

    test('keeps the UTC calendar date when converted to a JS Date for the date pickers', () => {
        freezeTime('2026-07-19T20:00:00Z', bangkok);

        expect(DateTime.fromJSDate(utcToday().toJSDate()).toFormat('yyyy-MM-dd')).toBe('2026-07-19');
    });
});

describe('dateTimeInMonths', () => {
    test('offers a maximum date that the backend accepts as within one year', () => {
        freezeTime('2026-07-19T20:00:00Z', bangkok);

        expect(dateTimeInMonths(12).toFormat('yyyy-MM-dd')).toBe('2027-07-19');
        expect(dateTimeInMonths(6).toFormat('yyyy-MM-dd')).toBe('2027-01-19');
    });
});
