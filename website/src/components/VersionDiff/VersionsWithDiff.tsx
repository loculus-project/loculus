import { useState } from 'react';

import { DiffTable } from './DiffTable';
import { useVersionComparison } from './useVersionComparison';
import { routes } from '../../routes/routes';
import type { SequenceEntryHistoryEntry } from '../../types/lapis';
import { getAccessionVersionString, extractAccessionVersion } from '../../utils/extractAccessionVersion';
import { getVersionStatusColor, getVersionStatusLabel } from '../../utils/getVersionStatusColor';
import { Checkbox } from '../common/Checkbox';
import ErrorBox from '../common/ErrorBox';
import { Spinner } from '../common/Spinner';
import { withQueryProvider } from '../common/withQueryProvider';

type VersionsWithDiffProps = {
    versions: SequenceEntryHistoryEntry[];
    accession: string;
};

function VersionsWithDiffInner({ versions, accession }: VersionsWithDiffProps) {
    const { selectedVersions, selectedPair, toggleVersion, comparison, isLoading, isFetching, error } =
        useVersionComparison(accession, versions);

    const showCheckboxes = versions.length > 2;
    const [hideUnchangedFields, setHideUnchangedFields] = useState(true);
    const [mutationsDiffOnly, setMutationsDiffOnly] = useState(true);

    // Prefer the pair the loaded comparison is for (kept stable while a new pair loads), falling
    // back to the current selection during the very first load.
    const comparedVersions = comparison?.versions ?? selectedPair;

    return (
        <div>
            <div className='mb-6'>
                <h2 className='text-xl font-semibold mb-4'>Version History</h2>
                {showCheckboxes && <p className='text-sm text-gray-600 mb-3'>Select two versions to compare</p>}
                <ul className='p-3'>
                    {versions.map((version) => (
                        <li key={version.version} className='mb-4'>
                            <div className='flex items-start gap-3'>
                                {showCheckboxes && (
                                    <Checkbox
                                        size='sm'
                                        aria-label={`Select ${getAccessionVersionString(extractAccessionVersion(version))} for comparison`}
                                        checked={selectedVersions.has(version.version)}
                                        onChange={() => toggleVersion(version.version)}
                                        className='mt-1'
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

            {(comparison !== undefined || selectedPair !== null) && (
                <div className='mt-8 border-t pt-6'>
                    <div className='flex justify-between items-center mb-4'>
                        <h2 className='text-xl font-semibold'>
                            Comparing Version {comparedVersions?.[0]} vs Version {comparedVersions?.[1]}
                        </h2>
                        <label className='flex items-center gap-2 cursor-pointer'>
                            <span className='text-sm'>Hide unchanged fields</span>
                            <Checkbox
                                size='sm'
                                checked={hideUnchangedFields}
                                onChange={(e) => setHideUnchangedFields(e.target.checked)}
                            />
                        </label>
                    </div>

                    {isLoading && (
                        <div className='flex justify-center items-center py-8'>
                            <Spinner size='lg' label='Loading comparison' />
                        </div>
                    )}

                    {error !== null && <ErrorBox title='Failed to load comparison'>{error}</ErrorBox>}

                    {error === null && comparison !== undefined && (
                        <div className='relative'>
                            <div className={`transition-opacity ${isFetching ? 'opacity-40 pointer-events-none' : ''}`}>
                                <DiffTable
                                    comparison={comparison.result}
                                    version1={comparison.versions[0]}
                                    version2={comparison.versions[1]}
                                    hideUnchangedFields={hideUnchangedFields}
                                    mutationsDiffOnly={mutationsDiffOnly}
                                    setMutationsDiffOnly={setMutationsDiffOnly}
                                />
                            </div>
                            {isFetching && (
                                <div className='absolute inset-0 flex items-start justify-center pt-8'>
                                    <Spinner size='lg' label='Loading comparison' />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export const VersionsWithDiff = withQueryProvider(VersionsWithDiffInner);
