import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { compareVersionData } from './compareVersions';
import { getErrorMessage } from '../../services/apiRequest';
import { fetchDetailsJson } from '../../services/detailsJsonApi';
import type { SequenceEntryHistoryEntry } from '../../types/lapis';

const STALE_TIME_MS = 5 * 60 * 1000;

function readComparePairFromUrl(): [number, number] | null {
    const compareParam = new URLSearchParams(window.location.search).get('compare');
    if (compareParam === null) {
        return null;
    }
    const versions = compareParam
        .split(',')
        .map((v) => parseInt(v, 10))
        .filter((v) => !isNaN(v));
    return versions.length === 2 ? [versions[0], versions[1]] : null;
}

/**
 * Owns version selection, URL persistence (`?compare=1,2`) and data fetching for the
 * version diff view. The selected pair drives a react-query query that fetches both
 * versions' `details.json` and produces the comparison result.
 */
export function useVersionComparison(accession: string, versions: SequenceEntryHistoryEntry[]) {
    const [selectedVersions, setSelectedVersions] = useState<Set<number>>(() => {
        const fromUrl = readComparePairFromUrl();
        if (fromUrl !== null) {
            return new Set(fromUrl);
        }
        // Default to comparing the two most recent versions (e.g. 2 & 3 of 3).
        const twoMostRecent = versions
            .map((v) => v.version)
            .sort((a, b) => b - a)
            .slice(0, 2);
        return new Set(twoMostRecent);
    });

    const selectedPair = useMemo<[number, number] | null>(() => {
        const sorted = Array.from(selectedVersions).sort((a, b) => a - b);
        return sorted.length === 2 ? [sorted[0], sorted[1]] : null;
    }, [selectedVersions]);

    // Keep the URL in sync with the current selection so comparisons are shareable.
    useEffect(() => {
        if (selectedPair === null) {
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set('compare', `${selectedPair[0]},${selectedPair[1]}`);
        window.history.replaceState({}, '', url.toString());
    }, [selectedPair]);

    const {
        data: comparison,
        isLoading,
        isFetching,
        error,
    } = useQuery({
        queryKey: ['website', 'versionDiff', { accession, selectedPair }],
        queryFn: async ({ signal }) => {
            const [v1, v2] = selectedPair!;
            const [data1, data2] = await Promise.all([
                fetchDetailsJson(`${accession}.${v1}`, signal),
                fetchDetailsJson(`${accession}.${v2}`, signal),
            ]);
            return { versions: [v1, v2] as [number, number], result: compareVersionData(data1, data2) };
        },
        enabled: selectedPair !== null,
        staleTime: STALE_TIME_MS,
        // Keep the previous comparison rendered while a new pair loads, so the table doesn't
        // unmount and the page doesn't jump scroll position.
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- Required in TanStack Query v4; migrate to placeholderData when upgrading to v5.
        keepPreviousData: true,
    });

    const toggleVersion = useCallback((version: number) => {
        setSelectedVersions((prev) => {
            const next = new Set(prev);
            if (next.has(version)) {
                next.delete(version);
            } else {
                // Only allow two selections; drop the oldest to make room.
                if (next.size >= 2) {
                    next.delete(Array.from(next)[0]);
                }
                next.add(version);
            }
            return next;
        });
    }, []);

    return {
        selectedVersions,
        selectedPair,
        toggleVersion,
        comparison,
        isLoading,
        isFetching,
        error: error !== null ? getErrorMessage(error) : null,
    };
}
