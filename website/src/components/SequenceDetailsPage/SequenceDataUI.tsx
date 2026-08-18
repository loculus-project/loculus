import type { FC } from 'react';

import DataTable from './DataTable';
import { SequenceManagement } from './SequenceManagement.tsx';
import { SequencesContainer } from './SequencesDisplay/SequencesContainer.tsx';
import { getDataTableData } from './getDataTableData';
import { type TableDataEntry } from './types';
import { getGitHubReportUrl } from '../../config.ts';
import { DATA_USE_TERMS_FIELD } from '../../settings.ts';
import { type DataUseTermsHistoryEntry, type Group } from '../../types/backend';
import { type Schema, type SequenceFlaggingConfig } from '../../types/config';
import { type SequenceEntryHistory } from '../../types/lapis';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes';
import { type ClientConfig } from '../../types/runtimeConfig';
import { type SequenceCitation } from '../../types/seqSetCitation.ts';
import type { SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';
import { Button } from '../common/Button';
import RestrictedUseWarning from '../common/RestrictedUseWarning';

interface Props {
    tableData: TableDataEntry[];
    organism: string;
    segmentReferences?: SegmentReferenceSelections;
    accessionVersion: string;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    schema: Schema;
    clientConfig: ClientConfig;
    myGroups: Group[];
    accessToken: string | undefined;
    sequenceFlaggingConfig: SequenceFlaggingConfig | undefined;
    referenceGenomesInfo: ReferenceGenomesInfo;
    sequenceCitations?: SequenceCitation[];
    sequenceEntryHistory?: SequenceEntryHistory;
    isRevocation?: boolean;
    onRevokeSuccess?: () => void;
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
    referenceGenomesInfo,
    sequenceCitations,
    sequenceEntryHistory,
    isRevocation,
    onRevokeSuccess,
}: Props) => {
    dataUseTermsHistory.sort((a, b) => (a.changeDate > b.changeDate ? -1 : 1));

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
                referenceGenomesInfo={referenceGenomesInfo}
                sequenceCitations={sequenceCitations}
            />
            {schema.submissionDataTypes.consensusSequences && !isRevocation && (
                <div className='mt-10'>
                    <SequencesContainer
                        organism={organism}
                        segmentReferences={segmentReferences}
                        accessionVersion={accessionVersion}
                        clientConfig={clientConfig}
                        referenceGenomesInfo={referenceGenomesInfo}
                        loadSequencesAutomatically={loadSequencesAutomatically}
                    />
                </div>
            )}
            <SequenceManagement
                tableData={tableData}
                organism={organism}
                accessionVersion={accessionVersion}
                dataUseTermsHistory={dataUseTermsHistory}
                sequenceEntryHistory={sequenceEntryHistory}
                clientConfig={clientConfig}
                myGroups={myGroups}
                accessToken={accessToken}
                isRevocation={isRevocation}
                onRevokeSuccess={onRevokeSuccess}
            />
            {reportUrl !== undefined && (
                <>
                    <hr className='my-4' />
                    <div className='my-8'>
                        <h2 className='text-xl font-bold mb-3'>Report an issue with this sequence or metadata</h2>
                        <Button as='a' size='sm' href={reportUrl}>
                            Create GitHub issue
                        </Button>
                    </div>
                </>
            )}
        </>
    );
};
