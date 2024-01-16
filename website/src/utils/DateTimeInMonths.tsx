import { DateTime } from 'luxon';

export const dateTimeInMonths = (monthsFromNow: number) => DateTime.now().plus({ months: monthsFromNow });
