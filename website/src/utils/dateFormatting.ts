import { DateTime, FixedOffsetZone } from 'luxon';

const UTC_DATETIME_FORMAT = 'yyyy-MM-dd TTT'; // TTT = timezone abbreviation (e.g. "UTC")
const DATE_ONLY_FORMAT = 'yyyy-MM-dd';

/**
 * Format a UTC datetime string (ISO 8601) for display, including the timezone.
 * Example output: "2026-07-02 12:32 UTC"
 */
export function formatUtcDatetime(isoDateString: string): string {
    return DateTime.fromISO(isoDateString, { zone: FixedOffsetZone.utcInstance })
        .setLocale('en')
        .toFormat(UTC_DATETIME_FORMAT);
}

/**
 * Format a Unix timestamp (seconds) as a UTC datetime string for display, including the timezone.
 * Example output: "2026-07-02 12:32 UTC"
 */
export function formatUnixTimestamp(value: number): string {
    return DateTime.fromSeconds(value, { zone: FixedOffsetZone.utcInstance }).toFormat(UTC_DATETIME_FORMAT);
}

/**
 * Format a date-only value (no time component) as YYYY-MM-DD.
 * Accepts a Luxon DateTime object.
 * Example output: "2026-07-02"
 */
export function formatDateOnly(date: DateTime): string {
    return date.toFormat(DATE_ONLY_FORMAT);
}

/**
 * Extract the date portion from an ISO 8601 datetime string, interpreted as UTC.
 * Example output: "2026-07-02"
 */
export function formatIsoToDateOnly(isoDateString: string): string {
    return DateTime.fromISO(isoDateString, { zone: FixedOffsetZone.utcInstance }).toFormat(DATE_ONLY_FORMAT);
}
