import { useState } from 'react';

import { routes } from '../../routes/routes';
import { backendClientHooks } from '../../services/serviceHooks';
import { inProcessingStatus, processedStatus, receivedStatus, type AccessionVersion } from '../../types/backend';
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
import ErrorBox from '../common/ErrorBox';
import { Spinner } from '../common/Spinner';
import { withQueryProvider } from '../common/withQueryProvider';

type Props = {
    accessionVersion: AccessionVersion;
    metadata: Metadata[];
    organism: string;
    clientConfig: ClientConfig;
    accessToken: string;
    groupId: number;
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

function RevisionDiffPageInner({
    accessionVersion,
    metadata,
    organism,
    clientConfig,
    accessToken,
    groupId,
    referenceGenomesInfo,
}: Props) {
    const { accession, version } = accessionVersion;
    const [hideUnchangedFields, setHideUnchangedFields] = useState(true);
    const hooks = backendClientHooks(clientConfig);
    const request = { headers: createAuthorizationHeader(accessToken), params: { organism, accession, version } };
    const options = { retry: false };
    const current = hooks.useGetDataToEdit(request, options);
    const previous = hooks.useGetDataToEdit(
        { ...request, params: { ...request.params, version: version - 1 } },
        options,
    );
    // Re-editing clears processed data, so data-to-edit can fail before returning the status.
    const processingEntries = hooks.useGetSequences(
        {
            headers: request.headers,
            params: { organism },
            queries: { groupIdsFilter: String(groupId), statusesFilter: `${receivedStatus},${inProcessingStatus}` },
        },
        { ...options, enabled: current.isError },
    );
    const loading = current.isFetching || previous.isFetching || (current.isError && processingEntries.isFetching);
    const failed = current.isError || previous.isError;
    const wrongGroup = current.data !== undefined && current.data.groupId !== groupId;
    const stillProcessing =
        current.data?.status === receivedStatus ||
        current.data?.status === inProcessingStatus ||
        (current.isError &&
            processingEntries.isSuccess &&
            processingEntries.data.sequenceEntries.some(
                (entry) => entry.accession === accession && entry.version === version,
            ));
    const notPending = current.data !== undefined && current.data.status !== processedStatus;
    const comparison =
        !loading && !failed && !wrongGroup && !notPending && current.data && previous.data
            ? compareVersionData(
                  { tableData: getMetadataTableData(metadata, previous.data.processedData.metadata) },
                  { tableData: getMetadataTableData(metadata, current.data.processedData.metadata) },
              )
            : undefined;
    const sequenceChanges =
        comparison && current.data && previous.data
            ? compareNucleotideSequences(
                  previous.data.processedData.unalignedNucleotideSequences,
                  current.data.processedData.unalignedNucleotideSequences,
                  lapisNameToDisplayName(referenceGenomesInfo),
              )
            : [];
    const retry = () => {
        void current.refetch();
        void previous.refetch();
        if (current.isError) void processingEntries.refetch();
    };

    return (
        <div>
            <a href={routes.userSequenceReviewPage(organism, groupId)} className='inline-block text-primary-600 mb-4'>
                ← Back to review
            </a>
            <h1 className='title mb-4'>
                Metadata changes for {accession}.{version}
            </h1>
            <p className='text-sm text-gray-600 mb-4'>
                Comparing previously approved version {version - 1} with pending revision {version}.
            </p>
            {loading ? (
                <div className='flex justify-center py-8'>
                    <Spinner size='lg' label='Loading metadata comparison' />
                </div>
            ) : wrongGroup ? (
                <ErrorBox title='Revision not found in this group'>Return to review to select a revision.</ErrorBox>
            ) : stillProcessing ? (
                <div className='text-gray-600'>
                    <p>This revision is still being processed. Try again shortly to view its metadata changes.</p>
                    <Button className='underline mt-2' onClick={retry}>
                        Retry
                    </Button>
                </div>
            ) : failed ? (
                <ErrorBox title='Could not load metadata comparison'>
                    <p>
                        {previous.isError
                            ? 'The previous version could not be loaded. It may be revoked or unavailable, or you may no longer have access.'
                            : 'The pending revision could not be loaded. It may have changed, or you may no longer have access.'}
                    </p>
                    <Button className='underline mt-2' onClick={retry}>
                        Retry
                    </Button>
                </ErrorBox>
            ) : notPending ? (
                <p className='text-gray-600'>
                    This revision is not awaiting review. Return to review to check its status.
                </p>
            ) : comparison !== undefined ? (
                <>
                    {sequenceChanges.length > 0 && (
                        <ul className='text-sm text-gray-600 mb-4'>
                            {sequenceChanges.map(({ name, label, changed }) => (
                                <li key={name}>
                                    {label === undefined ? 'Nucleotide sequence' : `Segment ${label}`}:{' '}
                                    <span className={changed ? 'font-medium text-amber-700' : undefined}>
                                        {changed ? 'changed' : 'unchanged'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <label className='flex justify-end items-center gap-2 mb-4 cursor-pointer'>
                        <span className='text-sm'>Hide unchanged fields ({comparison.unchangedFields.length})</span>
                        <Checkbox
                            size='sm'
                            aria-label='Hide unchanged fields'
                            checked={hideUnchangedFields}
                            onChange={(event) => setHideUnchangedFields(event.target.checked)}
                        />
                    </label>
                    {comparison.changedFields.length === 0 && (
                        <p className='text-gray-600 mb-4'>No metadata changes.</p>
                    )}
                    {(comparison.changedFields.length > 0 ||
                        comparison.noisyFields.length > 0 ||
                        !hideUnchangedFields) && (
                        <DiffTable
                            comparison={comparison}
                            version1={version - 1}
                            version2={version}
                            hideUnchangedFields={hideUnchangedFields}
                        />
                    )}
                </>
            ) : null}
        </div>
    );
}

export const RevisionDiffPage = withQueryProvider(RevisionDiffPageInner);
