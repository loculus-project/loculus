import { formatUnixTimestamp } from './dateFormatting';

export function parseUnixTimestamp(value: number) {
    return formatUnixTimestamp(value);
}
