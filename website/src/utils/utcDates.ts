import { DateTime } from 'luxon';

/**
 * Today's UTC calendar date, placed in the local zone so that converting it to a JS `Date` for the
 * date pickers preserves that calendar date.
 */
export const utcToday = () => DateTime.utc().startOf('day').setZone('local', { keepLocalTime: true });

export const dateTimeInMonths = (monthsFromNow: number) => utcToday().plus({ months: monthsFromNow });
