import { useState } from 'react';

import type { SequenceReviewData } from '../../types/backend';
import type { Metadata } from '../../types/config';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes';
import { lapisNameToDisplayName } from '../../utils/sequenceTypeHelpers';
import { getMetadataTableData } from '../SequenceDetailsPage/getMetadataTableData';
import type { TableDataEntry } from '../SequenceDetailsPage/types';
import { DiffTable } from '../VersionDiff/DiffTable';
import { compareVersionData } from '../VersionDiff/compareVersions';
import type { FieldComparison } from '../VersionDiff/types';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';

type RevisionDiffProps = {
    current: SequenceReviewData;
    metadataSchema: Metadata[];
    version: number;
    onRetry: () => void;
    referenceGenomesInfo: ReferenceGenomesInfo;
};

const SEQUENCES_HEADER = 'Sequences';

function getSequenceComparisons(
    changes: NonNullable<SequenceReviewData['revision']>['nucleotideChanges'],
    displayNames: Map<string, string | undefined>,
): FieldComparison[] {
    return Object.entries(changes).map(([name, { changed, previousLength, currentLength }]) => {
        const displayName = displayNames.get(name);
        const label = displayName === undefined ? 'Nucleotide sequence' : `Segment ${displayName}`;
        const entry = (length: number | null): TableDataEntry | null =>
            length === null
                ? null
                : {
                      name,
                      label,
                      header: SEQUENCES_HEADER,
                      value: `${length} nt`,
                      type: { kind: 'metadata', metadataType: 'string' },
                  };
        return {
            name: `sequence_${name}`,
            label,
            header: SEQUENCES_HEADER,
            entry1: entry(previousLength),
            entry2: entry(currentLength),
            hasChanged: changed,
            isNoisy: false,
            showChangedBadge: true,
        };
    });
}

export function RevisionDiff({ current, version, onRetry, metadataSchema, referenceGenomesInfo }: RevisionDiffProps) {
    const [hideUnchangedFields, setHideUnchangedFields] = useState(true);
    const revision = current.revision;
    if (revision?.previousMetadata == null || revision.previousVersion === null) {
        return (
            <div className='m-2 text-sm'>
                <p role='alert' className='text-red-600'>
                    The previous version could not be loaded. It may be revoked or unavailable.{' '}
                    <Button className='underline' onClick={onRetry}>
                        Retry
                    </Button>
                </p>
            </div>
        );
    }

    const metadataComparison = compareVersionData(
        { tableData: getMetadataTableData(metadataSchema, revision.previousMetadata) },
        { tableData: getMetadataTableData(metadataSchema, current.metadata) },
    );
    const sequenceComparison = getSequenceComparisons(
        revision.nucleotideChanges,
        lapisNameToDisplayName(referenceGenomesInfo),
    );
    const comparison = {
        ...metadataComparison,
        changedFields: [...metadataComparison.changedFields, ...sequenceComparison.filter((f) => f.hasChanged)],
        unchangedFields: [...metadataComparison.unchangedFields, ...sequenceComparison.filter((f) => !f.hasChanged)],
    };

    return (
        <div className='m-2 text-sm'>
            <label className='flex justify-end items-center gap-2 mb-2 cursor-pointer'>
                <span>Hide unchanged fields ({comparison.unchangedFields.length})</span>
                <Checkbox
                    size='sm'
                    aria-label='Hide unchanged fields'
                    checked={hideUnchangedFields}
                    onChange={(event) => setHideUnchangedFields(event.target.checked)}
                />
            </label>
            {metadataComparison.changedFields.length === 0 && (
                <p className='text-gray-600 mb-2'>No metadata changes.</p>
            )}
            {(comparison.changedFields.length > 0 || comparison.noisyFields.length > 0 || !hideUnchangedFields) && (
                <DiffTable
                    comparison={comparison}
                    version1={revision.previousVersion}
                    version2={version}
                    hideUnchangedFields={hideUnchangedFields}
                />
            )}
        </div>
    );
}
