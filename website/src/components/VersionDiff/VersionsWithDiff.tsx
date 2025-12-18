import { useEffect, useState } from 'react';

import { DiffTable } from './DiffTable';
import { compareVersionData } from './compareVersions';
import type { ComparisonResult } from './types';
import { routes } from '../../routes/routes';
import type { DetailsJson } from '../../types/detailsJson';
import type { SequenceEntryHistoryEntry } from '../../types/lapis';
import { getAccessionVersionString, extractAccessionVersion } from '../../utils/extractAccessionVersion';
import { getVersionStatusColor, getVersionStatusLabel } from '../../utils/getVersionStatusColor';

type VersionsWithDiffProps = {
    versions: SequenceEntryHistoryEntry[];
    accession: string;
};

export function VersionsWithDiff({ versions, accession }: VersionsWithDiffProps) {
    const [selectedVersions, setSelectedVersions] = useState<Set<number>>(new Set());
    const [showAllFields, setShowAllFields] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [comparisonData, setComparisonData] = useState<{
        v1: DetailsJson;
        v2: DetailsJson;
        result: ComparisonResult;
    } | null>(null);

    const showCheckboxes = versions.length > 2;
    const autoCompare = versions.length === 2;

    // Read URL params on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const compareParam = params.get('compare');

        if (compareParam) {
            const versionNumbers = compareParam
                .split(',')
                .map((v) => parseInt(v, 10))
                .filter((v) => !isNaN(v));
            if (versionNumbers.length === 2) {
                setSelectedVersions(new Set(versionNumbers));
            }
        } else if (autoCompare) {
            // Auto-select both versions if only 2 exist
            const versionNumbers = versions.map((v) => v.version);
            setSelectedVersions(new Set(versionNumbers));
        }
    }, [autoCompare, versions]);

    // Fetch and compare when selection changes
    useEffect(() => {
        const selectedArray = Array.from(selectedVersions);
        if (selectedArray.length !== 2) {
            setComparisonData(null);
            return;
        }

        const [v1, v2] = selectedArray.sort((a, b) => a - b);

        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('compare', `${v1},${v2}`);
        window.history.pushState({}, '', url.toString());

        // Fetch data
        const fetchAndCompare = async () => {
            setLoading(true);
            setError(null);

            try {
                const [data1, data2] = await Promise.all([
                    fetch(`/seq/${accession}.${v1}/details.json`).then((r) => {
                        if (!r.ok) throw new Error(`Failed to fetch version ${v1}`);
                        return r.json() as Promise<DetailsJson>;
                    }),
                    fetch(`/seq/${accession}.${v2}/details.json`).then((r) => {
                        if (!r.ok) throw new Error(`Failed to fetch version ${v2}`);
                        return r.json() as Promise<DetailsJson>;
                    }),
                ]);

                const result = compareVersionData(data1, data2);
                setComparisonData({ v1: data1, v2: data2, result });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch version data');
            } finally {
                setLoading(false);
            }
        };

        void fetchAndCompare();
    }, [selectedVersions, accession]);

    const handleVersionToggle = (version: number) => {
        const newSelection = new Set(selectedVersions);
        if (newSelection.has(version)) {
            newSelection.delete(version);
        } else {
            // Only allow 2 selections
            if (newSelection.size >= 2) {
                // Remove the oldest selection
                const oldest = Array.from(newSelection)[0];
                newSelection.delete(oldest);
            }
            newSelection.add(version);
        }
        setSelectedVersions(newSelection);
    };

    const selectedArray = Array.from(selectedVersions).sort((a, b) => a - b);
    const canCompare = selectedArray.length === 2;

    return (
        <div>
            <div className='mb-6'>
                <h2 className='text-xl font-semibold mb-4'>Version History</h2>
                {showCheckboxes && (
                    <p className='text-sm text-gray-600 mb-3'>
                        Select two versions to compare (selected: {selectedVersions.size}/2)
                    </p>
                )}
                <ul className='p-3'>
                    {versions.map((version) => (
                        <li key={version.version} className='mb-4'>
                            <div className='flex items-start gap-3'>
                                {showCheckboxes && (
                                    <input
                                        type='checkbox'
                                        checked={selectedVersions.has(version.version)}
                                        onChange={() => handleVersionToggle(version.version)}
                                        className='checkbox mt-1'
                                    />
                                )}
                                <div className='flex-1'>
                                    <div className='font-semibold'>{version.submittedAtTimestamp}</div>
                                    <div className='flex flex-row gap-3 justify-start'>
                                        <a
                                            href={routes.sequenceEntryDetailsPage(
                                                getAccessionVersionString(extractAccessionVersion(version)),
                                            )}
                                            className='hover:no-underline'
                                        >
                                            {getAccessionVersionString(extractAccessionVersion(version))}
                                        </a>
                                        <p
                                            className={`${getVersionStatusColor(version.versionStatus, version.isRevocation)} ml-2`}
                                        >
                                            {getVersionStatusLabel(version.versionStatus, version.isRevocation)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            {(canCompare || autoCompare) && (
                <div className='mt-8 border-t pt-6'>
                    <div className='flex justify-between items-center mb-4'>
                        <h2 className='text-xl font-semibold'>
                            Comparing Version {selectedArray[0]} vs Version {selectedArray[1]}
                        </h2>
                        <label className='flex items-center gap-2 cursor-pointer'>
                            <span className='text-sm'>Show all fields</span>
                            <input
                                type='checkbox'
                                checked={showAllFields}
                                onChange={(e) => setShowAllFields(e.target.checked)}
                                className='toggle toggle-sm'
                            />
                        </label>
                    </div>

                    {loading && (
                        <div className='flex justify-center items-center py-8'>
                            <div className='loading loading-spinner loading-lg'></div>
                        </div>
                    )}

                    {error && (
                        <div className='alert alert-error'>
                            <span>{error}</span>
                        </div>
                    )}

                    {!loading && !error && comparisonData && (
                        <DiffTable
                            comparison={comparisonData.result}
                            version1={selectedArray[0]}
                            version2={selectedArray[1]}
                            showAllFields={showAllFields}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
