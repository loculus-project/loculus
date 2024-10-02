import { DEFAULT_LOCALE } from '../settings';

export const formatNumberWithDefaultLocale = (num: number) => new Intl.NumberFormat(DEFAULT_LOCALE).format(num);
