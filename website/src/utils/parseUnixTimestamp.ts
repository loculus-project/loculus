import { DateTime, FixedOffsetZone } from 'luxon';

export function parseUnixTimestamp(value: number) {
    return DateTime.fromSeconds(value, { zone: FixedOffsetZone.utcInstance }).toFormat('yyyy-MM-dd TTT');
}
