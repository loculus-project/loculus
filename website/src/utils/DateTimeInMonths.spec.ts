import { DateTime, Settings } from 'luxon';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { dateTimeInMonths, utcToday } from './DateTimeInMonths.tsx';

describe('utcToday', () => {
    afterEach(() => {
        vi.useRealTimers();
        Settings.defaultZone = 'system';
    });

    const freezeTime = (isoInstant: string, zone: string) => {
        Settings.defaultZone = zone;
        vi.useFakeTimers();
        vi.setSystemTime(new Date(isoInstant));
    };

    test('returns the UTC date when the local date is already a day ahead', () => {
        freezeTime('2026-07-19T23:19:00Z', 'Europe/Berlin'); // 01:19 on 20 July locally

        expect(utcToday().toFormat('yyyy-MM-dd')).toBe('2026-07-19');
    });

    test('returns the UTC date when the local date is still a day behind', () => {
        freezeTime('2026-07-20T01:00:00Z', 'America/Los_Angeles'); // 18:00 on 19 July locally

        expect(utcToday().toFormat('yyyy-MM-dd')).toBe('2026-07-20');
    });

    test('keeps the UTC calendar date when converted to a JS Date for the date pickers', () => {
        freezeTime('2026-07-19T23:19:00Z', 'Europe/Berlin');

        expect(DateTime.fromJSDate(utcToday().toJSDate()).toFormat('yyyy-MM-dd')).toBe('2026-07-19');
    });
});

describe('dateTimeInMonths', () => {
    afterEach(() => {
        vi.useRealTimers();
        Settings.defaultZone = 'system';
    });

    test('offers a maximum date that the backend accepts as within one year', () => {
        Settings.defaultZone = 'Europe/Berlin';
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-19T23:19:00Z'));

        expect(dateTimeInMonths(12).toFormat('yyyy-MM-dd')).toBe('2027-07-19');
        expect(dateTimeInMonths(6).toFormat('yyyy-MM-dd')).toBe('2027-01-19');
    });
});
