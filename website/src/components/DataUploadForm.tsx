import { CircularProgress, TextField } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import { isErrorFromAlias } from '@zodios/core';
import type { AxiosError } from 'axios';
import { type DateTime } from 'luxon';
import { type ChangeEvent, type FormEvent, useMemo, useState, useRef, useEffect } from 'react';

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
    onSuccess: () => void;
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
    const [exampleEntries, setExampleEntries] = useState<number | undefined>(undefined);
    const metadataFileInputRef = useRef<HTMLInputElement>(null);
    const sequenceFileInputRef = useRef<HTMLInputElement>(null);

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
        const { metadataFileContent, revisedMetadataFileContent, sequenceFileContent } = getExampleData(exampleEntries);

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

    useEffect(() => {
        const interval = setInterval(() => {
            // Check for files which are no longer readable - which generally indicates the file has been edited since being
            // selected in the UI - and clear these.
            metadataFile
                ?.slice(0, 1)
                .arrayBuffer()
                .catch(() => {
                    setMetadataFile(null);
                    if (metadataFileInputRef.current) {
                        metadataFileInputRef.current.value = '';
                    }
                });

            sequenceFile
                ?.slice(0, 1)
                .arrayBuffer()
                .catch(() => {
                    setSequenceFile(null);
                    if (sequenceFileInputRef.current) {
                        sequenceFileInputRef.current.value = '';
                    }
                });
        }, 500);

        return () => clearInterval(interval);
    }, [metadataFile, sequenceFile]);

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
                inputRef={metadataFileInputRef}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const file = event.target.files?.[0] || null;
                    setMetadataFile(file);
                }}
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
                inputRef={sequenceFileInputRef}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const file = event.target.files?.[0] || null;
                    setSequenceFile(file);
                }}
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
                    <>
                        <input
                            type='number'
                            className='p-1 border rounded-md w-28 placeholder:text-xs'
                            placeholder='num of examples'
                            value={exampleEntries ?? ''}
                            onChange={(event) => setExampleEntries(parseInt(event.target.value, 10))}
                        />
                        <button type='button' className='px-4 py-2 btn normal-case ' onClick={handleLoadExampleData}>
                            Load Example Data
                        </button>
                    </>
                )}

                <button
                    className='px-4 py-2 btn normal-case w-1/5'
                    disabled={isLoading || (action === 'submit' && noGroup)}
                    type='submit'
                >
                    {isLoading ? <CircularProgress size={20} color='primary' /> : 'Submit'}
                </button>
            </div>

            <div className='text-gray-500'>
                {isLoading
                    ? 'Uploading files. Please wait. Depending on the size of the files this can take a while'
                    : ''}
            </div>
        </form>
    );
};

export const DataUploadForm = withQueryProvider(withLocalizationProvider(InnerDataUploadForm));

function useSubmitFiles(
    accessToken: string,
    organism: string,
    clientConfig: ClientConfig,
    onSuccess: () => void,
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

function getExampleData(randomEntries = 20) {
    const regions = ['Europe', 'Asia', 'North America', 'South America', 'Africa', 'Australia'];
    const countries = ['Switzerland', 'USA', 'China', 'Brazil', 'Nigeria', 'Australia'];
    const divisions = ['Bern', 'California', 'Beijing', 'Rio de Janeiro', 'Lagos', 'Sydney'];
    const hosts = ['Homo sapiens', 'Canis lupus familiaris'];

    let metadataContent = 'submissionId\tdate\tregion\tcountry\tdivision\thost\n';
    let revisedMetadataContent = 'accession\tsubmissionId\tdate\tregion\tcountry\tdivision\thost\n';
    let sequenceContent = '';

    for (let i = 0; i < randomEntries; i++) {
        const submissionId = `custom${i}`;
        const date = new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000))
            .toISOString()
            .split('T')[0];
        const region = regions[Math.floor(Math.random() * regions.length)];
        const country = countries[Math.floor(Math.random() * countries.length)];
        const division = divisions[Math.floor(Math.random() * divisions.length)];
        const host = hosts[Math.floor(Math.random() * hosts.length)];

        metadataContent += `${submissionId}\t${date}\t${region}\t${country}\t${division}\t${host}\n`;
        revisedMetadataContent += `${i + 1}\t${submissionId}\t${date}\t${region}\t${country}\t${division}\t${host}\n`;
        sequenceContent += `>${submissionId}\nACTG\n`;
    }

    return {
        metadataFileContent: metadataContent,
        revisedMetadataFileContent: revisedMetadataContent,
        sequenceFileContent: sequenceContent,
    };
}

function createTempFile(content: BlobPart, mimeType: any, fileName: string) {
    const blob = new Blob([content], { type: mimeType });
    return new File([blob], fileName, { type: mimeType });
}
