import { useState } from 'react';

import { backendClientHooks } from '../../services/serviceHooks';
import type { SequenceEntryToEdit } from '../../types/backend';
import type { Metadata } from '../../types/config';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { lapisNameToDisplayName } from '../../utils/sequenceTypeHelpers';
import { getMetadataTableData } from '../SequenceDetailsPage/getMetadataTableData';
import { DiffTable } from '../VersionDiff/DiffTable';
import { compareVersionData } from '../VersionDiff/compareVersions';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Spinner } from '../common/Spinner';

type RevisionDiffProps = {
    current: SequenceEntryToEdit;
    metadataSchema: Metadata[];
    organism: string;
    clientConfig: ClientConfig;
    accessToken: string;
    referenceGenomesInfo: ReferenceGenomesInfo;
};

function compareNucleotideSequences(
    previous: Record<string, string | null>,
    current: Record<string, string | null>,
    displayNames: Map<string, string | undefined>,
) {
    return Object.keys({ ...previous, ...current })
        .filter((name) => (previous[name] ?? current[name] ?? null) !== null)
        .map((name) => ({ name, label: displayNames.get(name), changed: previous[name] !== current[name] }));
}

export function RevisionDiff({
    current,
    metadataSchema,
    organism,
    clientConfig,
    accessToken,
    referenceGenomesInfo,
}: RevisionDiffProps) {
    const [hideUnchangedFields, setHideUnchangedFields] = useState(true);
    const previousVersion = current.version - 1;
    const previous = backendClientHooks(clientConfig).useGetDataToEdit(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { organism, accession: current.accession, version: previousVersion },
        },
        { retry: false },
    );

    if (previous.data === undefined) {
        return (
            <div className='m-2 text-sm'>
                {previous.isError && !previous.isFetching ? (
                    <p role='alert' className='text-red-600'>
                        The previous version could not be loaded. It may be revoked or unavailable.{' '}
                        <Button className='underline' onClick={() => void previous.refetch()}>
                            Retry
                        </Button>
                    </p>
                ) : (
                    <Spinner size='sm' label='Loading metadata comparison' />
                )}
            </div>
        );
    }

    const comparison = compareVersionData(
        { tableData: getMetadataTableData(metadataSchema, previous.data.processedData.metadata) },
        { tableData: getMetadataTableData(metadataSchema, current.processedData.metadata) },
    );
    const sequenceChanges = compareNucleotideSequences(
        previous.data.processedData.unalignedNucleotideSequences,
        current.processedData.unalignedNucleotideSequences,
        lapisNameToDisplayName(referenceGenomesInfo),
    );

    return (
        <div className='m-2 text-sm'>
            <div className='flex flex-wrap items-center gap-2 mb-2'>
                <ul className='text-gray-600'>
                    {sequenceChanges.map(({ name, label, changed }) => (
                        <li key={name}>
                            {label === undefined ? 'Nucleotide sequence' : `Segment ${label}`}:{' '}
                            <span className={changed ? 'font-medium text-amber-700' : undefined}>
                                {changed ? 'changed' : 'unchanged'}
                            </span>
                        </li>
                    ))}
                </ul>
                <label className='ml-auto flex items-center gap-2 cursor-pointer'>
                    <span>Hide unchanged fields ({comparison.unchangedFields.length})</span>
                    <Checkbox
                        size='sm'
                        aria-label='Hide unchanged fields'
                        checked={hideUnchangedFields}
                        onChange={(event) => setHideUnchangedFields(event.target.checked)}
                    />
                </label>
            </div>
            {comparison.changedFields.length === 0 && <p className='text-gray-600 mb-2'>No metadata changes.</p>}
            {(comparison.changedFields.length > 0 || comparison.noisyFields.length > 0 || !hideUnchangedFields) && (
                <DiffTable
                    comparison={comparison}
                    version1={previousVersion}
                    version2={current.version}
                    hideUnchangedFields={hideUnchangedFields}
                />
            )}
        </div>
    );
}
