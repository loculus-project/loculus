import type { FC } from 'react';

import DataTable from './DataTable';
import { SequenceManagement } from './SequenceManagement.tsx';
import { SequencesContainer } from './SequencesDisplay/SequencesContainer.tsx';
import { getDataTableData } from './getDataTableData';
import { type SequenceData } from './types';
import { getGitHubReportUrl } from '../../config.ts';
import {
    ACCESSION_VERSION_FIELD,
    SUBMITTED_AT_FIELD,
    RELEASED_AT_FIELD,
    IS_REVOCATION_FIELD,
    ACCESSION_FIELD,
    VERSION_COMMENT_FIELD,
    VERSION_STATUS_FIELD,
    SUBMITTER_FIELD,
    GROUP_NAME_FIELD,
    VERSION_FIELD,
    GROUP_ID_FIELD,
    DATA_USE_TERMS_FIELD,
} from '../../settings';
import { type Group } from '../../types/backend';
import { type Schema, type SequenceFlaggingConfig } from '../../types/config';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes';
import { type ClientConfig } from '../../types/runtimeConfig';
import { type SequenceCitation } from '../../types/seqSetCitation.ts';
import { Button } from '../common/Button';
import RestrictedUseWarning from '../common/RestrictedUseWarning';

interface Props {
    sequenceData: SequenceData;
    organism: string;
    accessionVersion: string;
    schema: Schema;
    clientConfig: ClientConfig;
    myGroups: Group[];
    accessToken: string | undefined;
    sequenceFlaggingConfig: SequenceFlaggingConfig | undefined;
    referenceGenomesInfo: ReferenceGenomesInfo;
    sequenceCitations?: SequenceCitation[];
    onRevokeSuccess?: () => void;
}

const REVOCATION_VERSION_FIELDS = [
    ACCESSION_VERSION_FIELD,
    ACCESSION_FIELD,
    IS_REVOCATION_FIELD,
    RELEASED_AT_FIELD,
    VERSION_COMMENT_FIELD,
    VERSION_STATUS_FIELD,
    SUBMITTED_AT_FIELD,
    SUBMITTER_FIELD,
    VERSION_FIELD,
    GROUP_NAME_FIELD,
    GROUP_ID_FIELD,
    DATA_USE_TERMS_FIELD,
];

export const SequenceDataUI: FC<Props> = ({
    sequenceData,
    organism,
    accessionVersion,
    schema,
    clientConfig,
    myGroups,
    accessToken,
    sequenceFlaggingConfig,
    referenceGenomesInfo,
    sequenceCitations,
    onRevokeSuccess,
}: Props) => {
    const { tableData, dataUseTermsHistory, segmentReferences, sequenceEntryHistory, isRevocation } = sequenceData;

    dataUseTermsHistory.sort((a, b) => (a.changeDate > b.changeDate ? -1 : 1));

    const dataUseTerms = tableData.find((entry) => entry.name === DATA_USE_TERMS_FIELD);
    const isRestricted = dataUseTerms?.value.toString().toUpperCase() === 'RESTRICTED';

    const dataTableData = getDataTableData(
        isRevocation ? tableData.filter((entry) => REVOCATION_VERSION_FIELDS.includes(entry.name)) : tableData,
    );

    const reportUrl = isRevocation ? undefined : getGitHubReportUrl(sequenceFlaggingConfig, organism, accessionVersion);

    return (
        <>
            {isRestricted && <RestrictedUseWarning />}
            <DataTable
                dataTableData={dataTableData}
                segmentReferences={segmentReferences}
                dataUseTermsHistory={dataUseTermsHistory}
                referenceGenomesInfo={referenceGenomesInfo}
                sequenceCitations={isRevocation ? undefined : sequenceCitations}
            />
            {schema.submissionDataTypes.consensusSequences && !isRevocation && (
                <div className='mt-10'>
                    <SequencesContainer
                        organism={organism}
                        segmentReferences={segmentReferences}
                        accessionVersion={accessionVersion}
                        clientConfig={clientConfig}
                        referenceGenomesInfo={referenceGenomesInfo}
                        loadSequencesAutomatically={!!schema.loadSequencesAutomatically}
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
