import type { FC } from 'react';

import DataTable from './DataTable';
import { RevokeButton } from './RevokeButton';
import { SequencesContainer } from './SequencesContainer';
import { getDataTableData } from './getDataTableData';
import { type TableDataEntry } from './types';
import { getGitHubReportUrl, getLapisUrl } from '../../config.ts';
import { routes } from '../../routes/routes';
import { DATA_USE_TERMS_FIELD } from '../../settings.ts';
import { type DataUseTermsHistoryEntry, type Group, type RestrictedDataUseTerms } from '../../types/backend';
import { type Schema, type SequenceFlaggingConfig, type LinkOut } from '../../types/config';
import { type ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import { type ClientConfig } from '../../types/runtimeConfig';
import { EditDataUseTermsButton } from '../DataUseTerms/EditDataUseTermsButton';
import { DownloadUrlGenerator } from '../SearchPage/DownloadDialog/DownloadUrlGenerator.ts';
import { LinkOutMenu } from '../SearchPage/DownloadDialog/LinkOutMenu.tsx';
import { type SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters.tsx';
import ErrorBox from '../common/ErrorBox';
import MdiEye from '~icons/mdi/eye';

interface Props {
    tableData: TableDataEntry[];
    organism: string;
    accessionVersion: string;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    schema: Schema;
    clientConfig: ClientConfig;
    myGroups: Group[];
    accessToken: string | undefined;
    sequenceFlaggingConfig: SequenceFlaggingConfig | undefined;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    linkOuts?: LinkOut[];
}

export const SequenceDataUI: FC<Props> = ({
    tableData,
    organism,
    accessionVersion,
    dataUseTermsHistory,
    schema,
    clientConfig,
    myGroups,
    accessToken,
    sequenceFlaggingConfig,
    referenceGenomeSequenceNames,
    linkOuts,
}: Props) => {
    const groupId = tableData.find((entry) => entry.name === 'groupId')!.value as number;

    const isMyGroup = myGroups.some((group) => group.groupId === groupId);

    dataUseTermsHistory.sort((a, b) => (a.changeDate > b.changeDate ? -1 : 1));
    const currentDataUseTerms = dataUseTermsHistory[0].dataUseTerms;

    const dataUseTerms = tableData.find((entry) => entry.name === DATA_USE_TERMS_FIELD);
    const isRestricted = dataUseTerms?.value.toString().toUpperCase() === 'RESTRICTED';

    const genes = referenceGenomeSequenceNames.genes;
    const nucleotideSegmentNames = referenceGenomeSequenceNames.nucleotideSequences;
    const reference = referenceGenomeSequenceNames.insdcAccessionFull;

    const loadSequencesAutomatically = schema.loadSequencesAutomatically === true;

    const dataTableData = getDataTableData(tableData);

    const reportUrl = getGitHubReportUrl(sequenceFlaggingConfig, organism, accessionVersion);

    const downloadUrlGenerator = new DownloadUrlGenerator(
        organism,
        getLapisUrl(clientConfig, organism),
        false,
        schema.richFastaHeaderFields,
    );

    const sequenceFilter: SequenceFilter = {
        isEmpty: () => false,
        sequenceCount: () => 1,
        toApiParams: () => ({ [schema.primaryKey]: accessionVersion }),
        toUrlSearchParams: () => [[schema.primaryKey, accessionVersion]],
        toDisplayStrings: () => new Map(),
    };

    return (
        <>
            {isRestricted && (
                <ErrorBox title='Restricted sequence' level='warning'>
                    This sequence is only available under the Restricted Use Terms. If you make use of this data, you
                    must follow the{' '}
                    <a href={routes.datauseTermsPage()} className='underline'>
                        terms of use.
                    </a>
                </ErrorBox>
            )}
            <DataTable dataTableData={dataTableData} dataUseTermsHistory={dataUseTermsHistory} reference={reference} />
            {schema.submissionDataTypes.consensusSequences && (
                <div className='mt-10'>
                    <SequencesContainer
                        organism={organism}
                        accessionVersion={accessionVersion}
                        clientConfig={clientConfig}
                        genes={genes}
                        nucleotideSegmentNames={nucleotideSegmentNames}
                        loadSequencesAutomatically={loadSequencesAutomatically}
                    />
                </div>
            )}
            {linkOuts !== undefined && linkOuts.length > 0 && (
                <div className='mt-10'>
                    <LinkOutMenu
                        downloadUrlGenerator={downloadUrlGenerator}
                        sequenceFilter={sequenceFilter}
                        linkOuts={linkOuts}
                        dataUseTermsEnabled={false}
                        extraPlaceholderValues={{
                            accession: accessionVersion,
                            server: window.location.origin,
                        }}
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
