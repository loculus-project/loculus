import { DateTime } from 'luxon';

/**
 * The backend validates `restrictedUntil` against the current date in UTC, so the website has to use
 * the UTC date as well. Otherwise users in timezones ahead of UTC are offered a maximum date that the
 * backend rejects, and users in timezones behind UTC cannot pick the backend's "today".
 *
 * The returned DateTime holds the UTC calendar date but is placed in the local zone, so that
 * converting it to a JS `Date` for the date pickers preserves that calendar date.
 */
export const utcToday = () => DateTime.utc().startOf('day').setZone('local', { keepLocalTime: true });

export const dateTimeInMonths = (monthsFromNow: number) => utcToday().plus({ months: monthsFromNow });
