import type { MutationBadgeData, SegmentedMutations, SegmentedMutationStrings } from '../../types/config';
import type { TableDataEntry } from '../SequenceDetailsPage/types';

function badgeKey(m: MutationBadgeData): string {
    return `${m.sequenceName ?? ''}:${m.mutationFrom}${m.position}${m.mutationTo}`;
}

/** Returns the segments/mutations of `a` that are not present (per segment) in `b`. */
function subtractSegmentedMutations(a: SegmentedMutations[], b: SegmentedMutations[]): SegmentedMutations[] {
    const bKeysBySegment = new Map<string, Set<string>>();
    for (const { segment, mutations } of b) {
        bKeysBySegment.set(segment, new Set(mutations.map(badgeKey)));
    }
    const result: SegmentedMutations[] = [];
    for (const { segment, mutations } of a) {
        const bKeys = bKeysBySegment.get(segment) ?? new Set<string>();
        const onlyInA = mutations.filter((m) => !bKeys.has(badgeKey(m)));
        if (onlyInA.length > 0) {
            result.push({ segment, mutations: onlyInA });
        }
    }
    return result;
}

/** Returns the segments/strings of `a` that are not present (per segment) in `b`. */
function subtractSegmentedStrings(
    a: SegmentedMutationStrings[],
    b: SegmentedMutationStrings[],
): SegmentedMutationStrings[] {
    const bBySegment = new Map<string, Set<string>>();
    for (const { segment, mutations } of b) {
        bBySegment.set(segment, new Set(mutations));
    }
    const result: SegmentedMutationStrings[] = [];
    for (const { segment, mutations } of a) {
        const bKeys = bBySegment.get(segment) ?? new Set<string>();
        const onlyInA = mutations.filter((m) => !bKeys.has(m));
        if (onlyInA.length > 0) {
            result.push({ segment, mutations: onlyInA });
        }
    }
    return result;
}

/**
 * For a mutation / insertion / deletion field present in both versions, returns copies of
 * both entries whose `customDisplay` retains only the mutations unique to that version —
 * i.e. the removals (shown in the older column) and additions (shown in the newer one).
 * Mutations shared by both versions are dropped, so the diff highlights only what changed
 * instead of repeating the (potentially long) full mutation list on both sides.
 */
export function diffMutationEntries(entry1: TableDataEntry, entry2: TableDataEntry): [TableDataEntry, TableDataEntry] {
    const cd1 = entry1.customDisplay;
    const cd2 = entry2.customDisplay;

    if (cd1?.type === 'badge' && cd2?.type === 'badge') {
        const badge1 = cd1.badge ?? [];
        const badge2 = cd2.badge ?? [];
        return [
            { ...entry1, customDisplay: { ...cd1, badge: subtractSegmentedMutations(badge1, badge2) } },
            { ...entry2, customDisplay: { ...cd2, badge: subtractSegmentedMutations(badge2, badge1) } },
        ];
    }
    if (cd1?.type === 'list' && cd2?.type === 'list') {
        const list1 = cd1.list ?? [];
        const list2 = cd2.list ?? [];
        return [
            { ...entry1, customDisplay: { ...cd1, list: subtractSegmentedStrings(list1, list2) } },
            { ...entry2, customDisplay: { ...cd2, list: subtractSegmentedStrings(list2, list1) } },
        ];
    }
    return [entry1, entry2];
}
