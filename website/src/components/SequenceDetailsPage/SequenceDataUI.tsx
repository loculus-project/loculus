import type { FC } from 'react';

import DataTable from './DataTable';
import { RevokeButton } from './RevokeButton';
import { SequencesContainer } from './SequencesContainer';
import { getDataTableData } from './getDataTableData';
import { type TableDataEntry } from './types';
import { routes } from '../../routes/routes';
import { DATA_USE_TERMS_FIELD } from '../../settings.ts';
import { type DataUseTermsHistoryEntry, type Group, type RestrictedDataUseTerms } from '../../types/backend';
import { type Schema } from '../../types/config';
import { type ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import { type ClientConfig, type RuntimeConfig } from '../../types/runtimeConfig';
import { EditDataUseTermsButton } from '../DataUseTerms/EditDataUseTermsButton';
import ErrorBox from '../common/ErrorBox';
import MdiEye from '~icons/mdi/eye';

interface Props {
    tableData: TableDataEntry[];
    organism: string;
    accessionVersion: string;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    schema: Schema;
    runtimeConfig: RuntimeConfig;
    clientConfig: ClientConfig;
    myGroups: Group[];
    accessToken: string | undefined;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
}

export const SequenceDataUI: FC<Props> = ({
    tableData,
    organism,
    accessionVersion,
    dataUseTermsHistory,
    schema,
    runtimeConfig,
    clientConfig,
    myGroups,
    accessToken,
    referenceGenomeSequenceNames,
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
            <div className='mt-10'>
                <SequencesContainer
                    organism={organism}
                    accessionVersion={accessionVersion}
                    clientConfig={runtimeConfig.public}
                    genes={genes}
                    nucleotideSegmentNames={nucleotideSegmentNames}
                    loadSequencesAutomatically={loadSequencesAutomatically}
                />
            </div>
            {isMyGroup && accessToken !== undefined && (
                <div className='mt-5'>
                    <hr />
                    <h2 className='text-xl font-bold mt-10 mb-3'>Sequence Management</h2>
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
                    <div className='text-sm text-gray-400 mt-4 block'>&nbsp;</div>
                </div>
            )}
        </>
    );
};
