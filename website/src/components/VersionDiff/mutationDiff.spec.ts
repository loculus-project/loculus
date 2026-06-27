import { describe, expect, it } from 'vitest';

import { diffMutationEntries } from './mutationDiff';
import type { MutationBadgeData, SegmentedMutations } from '../../types/config';
import type { TableDataEntry } from '../SequenceDetailsPage/types';

const sub = (
    sequenceName: string | null,
    mutationFrom: string,
    position: number,
    mutationTo: string,
): MutationBadgeData => ({
    sequenceName,
    mutationFrom,
    position,
    mutationTo,
});

const badgeEntry = (badge: SegmentedMutations[]): TableDataEntry => ({
    label: 'Substitutions',
    name: 'nucleotideSubstitutions',
    value: '',
    header: 'Nucleotide mutations',
    customDisplay: { type: 'badge', badge },
    type: { kind: 'mutation' },
});

const listEntry = (list: { segment: string; mutations: string[] }[]): TableDataEntry => ({
    label: 'Deletions',
    name: 'nucleotideDeletions',
    value: '',
    header: 'Nucleotide mutations',
    customDisplay: { type: 'list', list },
    type: { kind: 'mutation' },
});

const badgeOf = (entry: TableDataEntry): SegmentedMutations[] =>
    entry.customDisplay?.type === 'badge' ? (entry.customDisplay.badge ?? []) : [];

describe('diffMutationEntries', () => {
    it('keeps only mutations unique to each version (badge)', () => {
        const v1 = badgeEntry([{ segment: 'main', mutations: [sub(null, 'A', 1, 'T'), sub(null, 'C', 5, 'G')] }]);
        const v2 = badgeEntry([{ segment: 'main', mutations: [sub(null, 'C', 5, 'G'), sub(null, 'G', 9, 'A')] }]);

        const [out1, out2] = diffMutationEntries(v1, v2);

        // shared C5G is dropped from both; only A1T (removed) and G9A (added) remain
        expect(badgeOf(out1)).toEqual([{ segment: 'main', mutations: [sub(null, 'A', 1, 'T')] }]);
        expect(badgeOf(out2)).toEqual([{ segment: 'main', mutations: [sub(null, 'G', 9, 'A')] }]);
    });

    it('drops a segment entirely when nothing differs within it', () => {
        const muts = [sub('S', 'A', 1, 'T')];
        const v1 = badgeEntry([{ segment: 'S', mutations: muts }]);
        const v2 = badgeEntry([{ segment: 'S', mutations: muts }]);

        const [out1, out2] = diffMutationEntries(v1, v2);

        expect(badgeOf(out1)).toEqual([]);
        expect(badgeOf(out2)).toEqual([]);
    });

    it('treats a substitution to a different target as a change', () => {
        const v1 = badgeEntry([{ segment: 'main', mutations: [sub(null, 'A', 1, 'T')] }]);
        const v2 = badgeEntry([{ segment: 'main', mutations: [sub(null, 'A', 1, 'G')] }]);

        const [out1, out2] = diffMutationEntries(v1, v2);

        expect(badgeOf(out1)).toEqual([{ segment: 'main', mutations: [sub(null, 'A', 1, 'T')] }]);
        expect(badgeOf(out2)).toEqual([{ segment: 'main', mutations: [sub(null, 'A', 1, 'G')] }]);
    });

    it('diffs string lists (deletions/insertions) per segment', () => {
        const v1 = listEntry([{ segment: 'main', mutations: ['10-12', '20'] }]);
        const v2 = listEntry([{ segment: 'main', mutations: ['20', '30'] }]);

        const [out1, out2] = diffMutationEntries(v1, v2);

        const listOf = (e: TableDataEntry) => (e.customDisplay?.type === 'list' ? e.customDisplay.list : undefined);
        expect(listOf(out1)).toEqual([{ segment: 'main', mutations: ['10-12'] }]);
        expect(listOf(out2)).toEqual([{ segment: 'main', mutations: ['30'] }]);
    });
});
