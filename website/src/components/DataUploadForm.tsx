import { CircularProgress, TextField } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import { isErrorFromAlias } from '@zodios/core';
import type { AxiosError } from 'axios';
import { type DateTime } from 'luxon';
import { type ChangeEvent, type FormEvent, useMemo, useState } from 'react';

import { withLocalizationProvider, withQueryProvider } from './common/withProvider.tsx';
import { getClientLogger } from '../clientLogger.ts';
import { useGroupManagementClient } from '../hooks/useGroupOperations.ts';
import { routes } from '../routes.ts';
import { backendApi } from '../services/backendApi.ts';
import { backendClientHooks } from '../services/serviceHooks.ts';
import {
    type DataUseTermsType,
    dataUseTermsTypes,
    openDataUseTermsType,
    restrictedDataUseTermsType,
    type SubmissionIdMapping,
} from '../types/backend.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { dateTimeInMonths } from '../utils/DateTimeInMonths.tsx';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../utils/stringifyMaybeAxiosError.ts';

type Action = 'submit' | 'revise';

type DataUploadFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    action: Action;
    onSuccess: (value: SubmissionIdMapping[]) => void;
    onError: (message: string) => void;
};

const logger = getClientLogger('DataUploadForm');

const InnerDataUploadForm = ({
    accessToken,
    organism,
    clientConfig,
    action,
    onSuccess,
    onError,
}: DataUploadFormProps) => {
    const [metadataFile, setMetadataFile] = useState<File | null>(null);
    const [sequenceFile, setSequenceFile] = useState<File | null>(null);

    const { zodiosHooks } = useGroupManagementClient(clientConfig);
    const groupsOfUser = zodiosHooks.useGetGroupsOfUser({
        headers: createAuthorizationHeader(accessToken),
    });

    if (groupsOfUser.error) {
        onError(`Failed to query Groups: ${stringifyMaybeAxiosError(groupsOfUser.error)}`);
    }

    const noGroup = useMemo(
        () => groupsOfUser.data === undefined || groupsOfUser.data.length === 0,
        [groupsOfUser.data],
    );

    const { submit, revise, isLoading } = useSubmitFiles(accessToken, organism, clientConfig, onSuccess, onError);
    const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);
    const [dataUseTermsType, setDataUseTermsType] = useState<DataUseTermsType>(openDataUseTermsType);
    const [restrictedUntil, setRestrictedUntil] = useState<DateTime>(dateTimeInMonths(6));

    const handleLoadExampleData = async () => {
        const { metadataFileContent, revisedMetadataFileContent, sequenceFileContent } = getExampleData();

        const exampleMetadataContent = action === `submit` ? metadataFileContent : revisedMetadataFileContent;

        const metadataFile = createTempFile(exampleMetadataContent, 'text/tab-separated-values', 'metadata.tsv');
        const sequenceFile = createTempFile(sequenceFileContent, 'application/octet-stream', 'sequences.fasta');

        setMetadataFile(metadataFile);
        setSequenceFile(sequenceFile);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        if (!metadataFile) {
            onError('Please select metadata file');
            return;
        }
        if (!sequenceFile) {
            onError('Please select a sequences file');
            return;
        }

        switch (action) {
            case 'submit':
                const groupName = selectedGroup ?? groupsOfUser.data?.[0].groupName;
                if (groupName === undefined) {
                    onError('Please select a group');
                    return;
                }
                submit({
                    metadataFile,
                    sequenceFile,
                    groupName,
                    dataUseTermsType,
                    restrictedUntil:
                        dataUseTermsType === restrictedDataUseTermsType ? restrictedUntil.toFormat('yyyy-MM-dd') : null,
                });
                break;
            case 'revise':
                revise({ metadataFile, sequenceFile });
                break;
        }
    };

    return (
        <form onSubmit={handleSubmit} className='p-6 space-y-6 max-w-md w-full'>
            {action === 'submit' &&
                (noGroup ? (
                    groupsOfUser.isLoading ? (
                        <p className='text-gray-500'>Loading groups...</p>
                    ) : (
                        <p className='text-red-500'>
                            No group found. Please join or <a href={routes.userOverviewPage()}>create a group</a>.
                        </p>
                    )
                ) : (
                    <div className='flex flex-col gap-3 w-fit'>
                        <span className='text-gray-700'>Submitting for:</span>
                        <select
                            id='groupDropdown'
                            name='groupDropdown'
                            value={selectedGroup}
                            onChange={(event) => setSelectedGroup(event.target.value)}
                            disabled={false}
                            className='p-2 border rounded-md'
                        >
                            {groupsOfUser.data!.map((group) => (
                                <option key={group.groupName} value={group.groupName}>
                                    {group.groupName}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}

            <TextField
                variant='outlined'
                margin='dense'
                label='Metadata File:'
                placeholder='Metadata File:'
                size='small'
                type='file'
                onChange={(event: ChangeEvent<HTMLInputElement>) => setMetadataFile(event.target.files?.[0] || null)}
                disabled={false}
                InputLabelProps={{
                    shrink: true,
                }}
            />

            <TextField
                variant='outlined'
                margin='dense'
                label='Sequences File:'
                placeholder='Sequences File:'
                size='small'
                type='file'
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSequenceFile(event.target.files?.[0] || null)}
                disabled={false}
                InputLabelProps={{
                    shrink: true,
                }}
            />

            {action === 'submit' && (
                <>
                    <div className='flex flex-col gap-3 w-fit'>
                        <span className='text-gray-700'>Data Use Terms</span>
                        <select
                            id='dataUseTermsDropdown'
                            name='dataUseTermsDropdown'
                            value={dataUseTermsType}
                            onChange={(event) => setDataUseTermsType(event.target.value as DataUseTermsType)}
                            disabled={false}
                            className='p-2 border rounded-md'
                        >
                            {dataUseTermsTypes.map((dataUseTerm) => (
                                <option key={dataUseTerm} value={dataUseTerm}>
                                    {dataUseTerm}
                                </option>
                            ))}
                        </select>
                    </div>

                    <DatePicker
                        format='yyyy-MM-dd'
                        disabled={isLoading || dataUseTermsType !== 'RESTRICTED'}
                        value={restrictedUntil}
                        label='Restricted Until'
                        minDate={dateTimeInMonths(0)}
                        maxDate={dateTimeInMonths(12)}
                        slotProps={{
                            textField: {
                                size: 'small',
                                margin: 'dense',
                            },
                        }}
                        onChange={(date: DateTime | null) => (date !== null ? setRestrictedUntil(date) : null)}
                    />
                </>
            )}

            <div className='flex gap-4'>
                {organism.startsWith('dummy-organism') && (
                    <button type='button' className='px-4 py-2 btn normal-case ' onClick={handleLoadExampleData}>
                        Load Example Data
                    </button>
                )}

                <button
                    className='px-4 py-2 btn normal-case w-1/5'
                    disabled={isLoading || (action === 'submit' && noGroup)}
                    type='submit'
                >
                    {isLoading ? <CircularProgress size={20} color='primary' /> : 'Submit'}
                </button>
            </div>
        </form>
    );
};

export const DataUploadForm = withQueryProvider(withLocalizationProvider(InnerDataUploadForm));

function useSubmitFiles(
    accessToken: string,
    organism: string,
    clientConfig: ClientConfig,
    onSuccess: (value: SubmissionIdMapping[]) => void,
    onError: (message: string) => void,
) {
    const hooks = backendClientHooks(clientConfig);
    const submit = hooks.useSubmit(
        { params: { organism }, headers: createAuthorizationHeader(accessToken) },
        { onSuccess, onError: handleError(onError, 'submit') },
    );
    const revise = hooks.useRevise(
        { params: { organism }, headers: createAuthorizationHeader(accessToken) },
        { onSuccess, onError: handleError(onError, 'revise') },
    );

    return {
        submit: submit.mutate,
        revise: revise.mutate,
        isLoading: submit.isLoading || revise.isLoading,
    };
}

function handleError(onError: (message: string) => void, action: Action) {
    return (error: unknown | AxiosError) => {
        void logger.error(`Received error from backend: ${stringifyMaybeAxiosError(error)}`);
        if (isErrorFromAlias(backendApi, action, error)) {
            switch (error.response.status) {
                case 400:
                    onError('Failed to submit sequence entries: ' + error.response.data.detail);
                    return;
                case 422:
                    onError('The submitted file content was invalid: ' + error.response.data.detail);
                    return;
                default:
                    onError(error.response.data.title + ': ' + error.response.data.detail);
                    return;
            }
        }
        onError('Received unexpected message from backend: ' + stringifyMaybeAxiosError(error));
    };
}

function getExampleData() {
    return {
        metadataFileContent: `
submissionId	date	region	country	division	host
custom0	2020-12-26	Europe	Switzerland	Bern	Homo sapiens
custom1	2020-12-15	Europe	Switzerland	Schaffhausen	Homo sapiens
custom2	2020-12-02	Europe	Switzerland	Bern	Homo sapiens
custom3	2020-12-02	Europe	Switzerland	Bern	Homo sapiens`,
        revisedMetadataFileContent: `
accession	submissionId	date	region	country	division	host
1	custom0	2020-12-26	Europe	Switzerland	Bern	Homo sapiens
2	custom1	2020-12-15	Europe	Switzerland	Schaffhausen	Homo sapiens
3	custom2	2020-12-02	Europe	Switzerland	Bern	Homo sapiens
4	custom3	2020-12-02	Europe	Switzerland	Bern	Homo sapiens`,
        sequenceFileContent: `
>custom0
ACTG
>custom1
ACTG
>custom2
ACTG
>custom3
ACTG`,
    };
}

function createTempFile(content: BlobPart, mimeType: any, fileName: string) {
    const blob = new Blob([content], { type: mimeType });
    return new File([blob], fileName, { type: mimeType });
}
