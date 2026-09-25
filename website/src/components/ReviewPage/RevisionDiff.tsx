import { useState } from 'react';

import { backendClientHooks } from '../../services/serviceHooks';
import type { SequenceEntryToEdit } from '../../types/backend';
import type { Metadata } from '../../types/config';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { lapisNameToDisplayName } from '../../utils/sequenceTypeHelpers';
import { getMetadataTableData } from '../SequenceDetailsPage/getMetadataTableData';
import type { TableDataEntry } from '../SequenceDetailsPage/types';
import { DiffTable } from '../VersionDiff/DiffTable';
import { compareVersionData } from '../VersionDiff/compareVersions';
import type { ComparisonResult, FieldComparison } from '../VersionDiff/types';
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

const SEQUENCES_HEADER = 'Sequences';

function sequenceEntry(name: string, label: string, sequence: string | null | undefined): TableDataEntry | null {
    if (sequence === null || sequence === undefined) return null;
    return {
        name,
        label,
        value: `${sequence.length.toLocaleString('en-US')} nt`,
        header: SEQUENCES_HEADER,
        type: { kind: 'metadata', metadataType: 'string' },
    };
}

// Sequences are compared on their full content but displayed only by length, so a
// same-length edit is flagged with an explicit "changed" badge.
function compareNucleotideSequences(
    previous: Record<string, string | null>,
    current: Record<string, string | null>,
    displayNames: Map<string, string | undefined>,
): FieldComparison[] {
    return Object.keys({ ...previous, ...current })
        .filter((name) => (previous[name] ?? current[name] ?? null) !== null)
        .map((name) => {
            const displayName = displayNames.get(name);
            const label = displayName === undefined ? 'Nucleotide sequence' : `Segment ${displayName}`;
            return {
                name: `sequence_${name}`,
                label,
                header: SEQUENCES_HEADER,
                entry1: sequenceEntry(name, label, previous[name]),
                entry2: sequenceEntry(name, label, current[name]),
                hasChanged: (previous[name] ?? null) !== (current[name] ?? null),
                isNoisy: false,
                showChangedBadge: true,
            };
        });
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

    const metadataComparison = compareVersionData(
        { tableData: getMetadataTableData(metadataSchema, previous.data.processedData.metadata) },
        { tableData: getMetadataTableData(metadataSchema, current.processedData.metadata) },
    );
    const sequenceComparison = compareNucleotideSequences(
        previous.data.processedData.unalignedNucleotideSequences,
        current.processedData.unalignedNucleotideSequences,
        lapisNameToDisplayName(referenceGenomesInfo),
    );
    const comparison: ComparisonResult = {
        ...metadataComparison,
        changedFields: [...metadataComparison.changedFields, ...sequenceComparison.filter((f) => f.hasChanged)],
        unchangedFields: [...metadataComparison.unchangedFields, ...sequenceComparison.filter((f) => !f.hasChanged)],
    };

    return (
        <div className='m-2 text-sm'>
            <div className='flex flex-wrap items-center gap-2 mb-2'>
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
            {metadataComparison.changedFields.length === 0 && (
                <p className='text-gray-600 mb-2'>No metadata changes.</p>
            )}
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
