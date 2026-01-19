import type { FC } from 'react';

import DataTable from './DataTable';
import { RevokeButton } from './RevokeButton';
import { SequencesContainer } from './SequencesDisplay/SequencesContainer.tsx';
import { getDataTableData } from './getDataTableData';
import { type TableDataEntry } from './types';
import { getGitHubReportUrl } from '../../config.ts';
import { routes } from '../../routes/routes';
import { DATA_USE_TERMS_FIELD } from '../../settings.ts';
import { type DataUseTermsHistoryEntry, type Group, type RestrictedDataUseTerms } from '../../types/backend';
import { type Schema, type SequenceFlaggingConfig } from '../../types/config';
import { type ReferenceGenomes } from '../../types/referencesGenomes';
import { type ClientConfig } from '../../types/runtimeConfig';
import { EditDataUseTermsButton } from '../DataUseTerms/EditDataUseTermsButton';
import RestrictedUseWarning from '../common/RestrictedUseWarning';
import MdiEye from '~icons/mdi/eye';
import type { SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';

interface Props {
    tableData: TableDataEntry[];
    organism: string;
    segmentReferences: SegmentReferenceSelections;
    accessionVersion: string;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    schema: Schema;
    clientConfig: ClientConfig;
    myGroups: Group[];
    accessToken: string | undefined;
    sequenceFlaggingConfig: SequenceFlaggingConfig | undefined;
    referenceGenomes: ReferenceGenomes;
}

export const SequenceDataUI: FC<Props> = ({
    tableData,
    organism,
    segmentReferences,
    accessionVersion,
    dataUseTermsHistory,
    schema,
    clientConfig,
    myGroups,
    accessToken,
    sequenceFlaggingConfig,
    referenceGenomes,
}: Props) => {
    const groupId = tableData.find((entry) => entry.name === 'groupId')!.value as number;

    const isMyGroup = myGroups.some((group) => group.groupId === groupId);

    dataUseTermsHistory.sort((a, b) => (a.changeDate > b.changeDate ? -1 : 1));
    const currentDataUseTerms = dataUseTermsHistory[0].dataUseTerms;

    const dataUseTerms = tableData.find((entry) => entry.name === DATA_USE_TERMS_FIELD);
    const isRestricted = dataUseTerms?.value.toString().toUpperCase() === 'RESTRICTED';

    const loadSequencesAutomatically = schema.loadSequencesAutomatically === true;

    const dataTableData = getDataTableData(tableData);

    const reportUrl = getGitHubReportUrl(sequenceFlaggingConfig, organism, accessionVersion);

    return (
        <>
            {isRestricted && <RestrictedUseWarning />}
            <DataTable
                dataTableData={dataTableData}
                segmentReferences={segmentReferences}
                dataUseTermsHistory={dataUseTermsHistory}
                referenceGenomes={referenceGenomes}
            />
            {schema.submissionDataTypes.consensusSequences && (
                <div className='mt-10'>
                    <SequencesContainer
                        organism={organism}
                        segmentReferences={segmentReferences}
                        accessionVersion={accessionVersion}
                        clientConfig={clientConfig}
                        referenceGenomes={referenceGenomes}
                        loadSequencesAutomatically={loadSequencesAutomatically}
                    />
                </div>
            )}
            {isMyGroup && accessToken !== undefined && (
                <>
                    <hr className='my-4' />
                    <div className='my-8'>
                        <h2 className='text-xl font-bold mb-3'>Sequence management</h2>
                        <div className='text-sm text-gray-400 mb-4 block'>
                            <MdiEye className='w-6 h-6 inline-block mr-2' />
                            Only visible to group members
                        </div>

                        {isRestricted && (
                            <EditDataUseTermsButton
                                clientConfig={clientConfig}
                                accessToken={accessToken}
                                accessionVersion={[accessionVersion.split('.')[0]]}
                                dataUseTerms={currentDataUseTerms as RestrictedDataUseTerms}
                            />
                        )}

                        <a
                            href={routes.editPage(organism, {
                                accession: accessionVersion.split('.')[0],
                                version: parseInt(accessionVersion.split('.')[1], 10),
                            })}
                            className='btn btn-sm mr-3'
                        >
                            Revise this sequence
                        </a>
                        <RevokeButton
                            organism={organism}
                            clientConfig={clientConfig}
                            accessionVersion={accessionVersion.split('.')[0]}
                            accessToken={accessToken}
                            groupId={groupId}
                        />
                    </div>
                </>
            )}
            {reportUrl !== undefined && (
                <>
                    <hr className='my-4' />
                    <div className='my-8'>
                        <h2 className='text-xl font-bold mb-3'>Report an issue with this sequence or metadata</h2>
                        <a href={reportUrl} className='btn btn-sm'>
                            Create GitHub issue
                        </a>
                    </div>
                </>
            )}
        </>
    );
};
