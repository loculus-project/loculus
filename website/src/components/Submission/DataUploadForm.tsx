import { Menu } from '@headlessui/react';
import { isErrorFromAlias } from '@zodios/core';
import type { AxiosError } from 'axios';
import { type DateTime } from 'luxon';
import { type FormEvent, useState, useRef, useEffect, useCallback, type ElementType } from 'react';

import { DateChangeModal } from './DateChangeModal';
import { getClientLogger } from '../../clientLogger.ts';
import { routes } from '../../routes.ts';
import { backendApi } from '../../services/backendApi.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import {
    type DataUseTermsType,
    openDataUseTermsType,
    restrictedDataUseTermsType,
    type Group,
} from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { dateTimeInMonths } from '../../utils/DateTimeInMonths.tsx';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError.ts';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import DashiconsGroups from '~icons/dashicons/groups';
import Locked from '~icons/fluent-emoji-high-contrast/locked';
import Unlocked from '~icons/fluent-emoji-high-contrast/unlocked';
import IwwaArrowDown from '~icons/iwwa/arrow-down';
import MaterialSymbolsInfoOutline from '~icons/material-symbols/info-outline';
import MaterialSymbolsLightDataTableOutline from '~icons/material-symbols-light/data-table-outline';
import PhDnaLight from '~icons/ph/dna-light';
type Action = 'submit' | 'revise';

type DataUploadFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    action: Action;
    groupsOfUser: Group[];
    onSuccess: () => void;
    onError: (message: string) => void;
};

const logger = getClientLogger('DataUploadForm');

const DataUseTerms = ({
    dataUseTermsType,
    setDataUseTermsType,
    restrictedUntil,
    setRestrictedUntil,
}: {
    dataUseTermsType: DataUseTermsType;
    setDataUseTermsType: (dataUseTermsType: DataUseTermsType) => void;
    restrictedUntil: DateTime;
    setRestrictedUntil: (restrictedUntil: DateTime) => void;
}) => {
    const [dateChangeModalOpen, setDateChangeModalOpen] = useState(false);

    return (
        <div className='grid sm:grid-cols-3 mt-0 pt-10'>
            {dateChangeModalOpen && (
                <DateChangeModal
                    restrictedUntil={restrictedUntil}
                    setRestrictedUntil={setRestrictedUntil}
                    setDateChangeModalOpen={setDateChangeModalOpen}
                    minDate={dateTimeInMonths(0)}
                    maxDate={dateTimeInMonths(12)}
                />
            )}
            <div>
                <h2 className='font-medium text-lg'>Terms of use</h2>
                <p className='text-gray-500 text-sm'>Specify how your data can be used</p>
            </div>
            <div className=' grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 col-span-2'>
                <div className='sm:col-span-4 px-8'>
                    <label htmlFor='username' className='block text-sm font-medium leading-6 text-gray-900'>
                        Terms of use for these data
                    </label>
                    <div className='mt-2'>
                        <div className='mt-6 space-y-2'>
                            <div className='flex items-center gap-x-3'>
                                <input
                                    id='data-use-open'
                                    name='data-use'
                                    onChange={() => setDataUseTermsType(openDataUseTermsType)}
                                    type='radio'
                                    checked={dataUseTermsType === openDataUseTermsType}
                                    className='h-4 w-4 border-gray-300 text-iteal-600 focus:ring-iteal-600'
                                />
                                <label
                                    htmlFor='data-use-open'
                                    className='block text-sm font-medium leading-6 text-gray-900'
                                >
                                    <Unlocked className='h-4 w-4 inline-block mr-2 -mt-1' />
                                    Open
                                </label>
                            </div>
                            <div className='text-xs pl-6 text-gray-500 pb-4'>
                                Anyone can use and share the data (though we believe researchers should exercise
                                scientific etiquette, including the importance of citation). Data will be released to
                                the INSDC databases shortly after submission.{' '}
                                <a href='#TODO-MVP' className='text-primary-600'>
                                    Find out more
                                </a>
                                .
                            </div>

                            <div className='flex items-center gap-x-3'>
                                <input
                                    id='data-use-restricted'
                                    name='data-use'
                                    onChange={() => setDataUseTermsType(restrictedDataUseTermsType)}
                                    type='radio'
                                    checked={dataUseTermsType === restrictedDataUseTermsType}
                                    className='h-4 w-4 border-gray-300 text-iteal-600 focus:ring-iteal-600'
                                />
                                <label
                                    htmlFor='data-use-restricted'
                                    className='block text-sm font-medium leading-6 text-gray-900'
                                >
                                    <Locked className='h-4 w-4 inline-block mr-2 -mt-1' />
                                    Restricted
                                </label>
                            </div>

                            <div className='text-xs pl-6 text-gray-500 mb-4'>
                                Data will be restricted for a period of time. The sequences will be available but there
                                will be limitations on how they can be used by others.{' '}
                                <a href='#TODO-MVP' className='text-primary-600'>
                                    Find out more
                                </a>
                                .
                            </div>
                            {dataUseTermsType === restrictedDataUseTermsType && (
                                <div className='text-sm pl-6 text-gray-900 mb-4'>
                                    Data will be restricted until <b>{restrictedUntil.toFormat('yyyy-MM-dd')}</b>.{' '}
                                    <button
                                        className='border rounded px-2 py-1 '
                                        onClick={() => setDateChangeModalOpen(true)}
                                    >
                                        Change date
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DevExampleData = ({
    setExampleEntries,
    exampleEntries,
    metadataFile,
    sequenceFile,
    handleLoadExampleData,
}: {
    setExampleEntries: (entries: number) => void;
    exampleEntries: number | undefined;
    metadataFile: File | null;
    sequenceFile: File | null;
    handleLoadExampleData: () => void;
}) => {
    return (
        <p className='text-gray-800 text-xs mt-5 opacity-50'>
            Add dev example data
            <br />
            <input
                type='number'
                value={exampleEntries ?? ''}
                onChange={(event) => setExampleEntries(parseInt(event.target.value, 10))}
                className='w-32'
            />
            <button type='button' onClick={handleLoadExampleData} className='border rounded px-2 py-1 '>
                Load Example Data
            </button>{' '}
            <br />
            {metadataFile && sequenceFile && <span className='text-xs text-gray-500'>Example data loaded</span>}
        </p>
    );
};

const GroupSelector = ({
    groupNames,
    selectedGroupName,
    setSelectedGroupName,
}: {
    groupNames: string[];
    selectedGroupName: string | undefined;
    setSelectedGroupName: (groupName: string) => void;
}) => {
    if (groupNames.length === 1) {
        return <div className='mb-4 text-gray-500'>Current group: {selectedGroupName}</div>;
    }
    return (
        <div className='mb-4 text-gray-500 text-sm'>
            <Menu>
                <Menu.Button aria-label='Select group'>
                    Current group: {selectedGroupName}
                    <span className='text-primary-600 ml-2'>
                        <IwwaArrowDown className='w-4 h-4 inline-block -mt-0.5' />
                    </span>
                </Menu.Button>
                <Menu.Items
                    className={`absolute z-10 bg-white border border-gray-300 divide-y divide-gray-300 min-w-56 rounded mt-2
                transition-all duration-200 ease-in-out shadow-lg 
                `}
                >
                    {groupNames.map((groupName) => (
                        <Menu.Item key={groupName}>
                            {({ active }) => (
                                <button
                                    className={`${
                                        active ? 'bg-primary-500 text-white' : 'text-gray-900'
                                    } flex  w-full px-4 py-2 text-sm`}
                                    onClick={() => setSelectedGroupName(groupName)}
                                >
                                    <DashiconsGroups className='w-6 h-6 inline-block mr-2' />
                                    {groupName}
                                </button>
                            )}
                        </Menu.Item>
                    ))}
                </Menu.Items>
            </Menu>
        </div>
    );
};

const UploadComponent = ({
    setFile,
    name,
    title,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Icon,
    fileType,
}: {
    setFile: (file: File | null) => void;
    name: string;
    title: string;
    Icon: ElementType;
    fileType: string;
}) => {
    const [myFile, rawSetMyFile] = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const setMyFile = useCallback(
        (file: File | null) => {
            setFile(file);
            rawSetMyFile(file);
        },
        [setFile, rawSetMyFile],
    );
    const fileInputRef = useRef<HTMLInputElement>(null);
    const handleUpload = () => {
        document.getElementById(name)?.click();
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        setMyFile(file);
    };

    useEffect(() => {
        const interval = setInterval(() => {
            // Check if the file is no longer readable - which generally indicates the file has been edited since being
            // selected in the UI - and clear it.
            myFile
                ?.slice(0, 1)
                .arrayBuffer()
                .catch(() => {
                    setMyFile(null);
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                });
        }, 500);

        return () => clearInterval(interval);
    }, [myFile, setMyFile]);
    return (
        <div className='sm:col-span-4'>
            <label className='text-gray-900 leading-6 font-medium text-sm block'>{title}</label>
            {!myFile ? (
                <div
                    className={`mt-2 flex justify-center rounded-lg border border-dashed  px-6 py-6 border-gray-900/25 h-40
                    ${isDragOver ? 'bg-green-100' : ''}  `}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className='text-center'>
                        <Icon className='mx-auto h-12 w-12 text-gray-300' aria-hidden='true' />
                        <div className='mt-4  text-sm leading-6 text-gray-600'>
                            <label
                                htmlFor='file-upload'
                                className='inline relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500'
                            >
                                <span onClick={handleUpload}>Upload a file</span>
                                <input
                                    id={name}
                                    name={name}
                                    type='file'
                                    className='sr-only'
                                    aria-label={title}
                                    onChange={(event) => {
                                        const file = event.target.files?.[0] || null;
                                        setMyFile(file);
                                    }}
                                    ref={fileInputRef}
                                />
                            </label>
                            <span className='pl-1'>or drag and drop</span>
                        </div>
                        <p className='text-xs leading-5 text-gray-600'>{fileType}</p>
                    </div>
                </div>
            ) : (
                <div className='h-40 text-center'>
                    <Icon className='w-12 h-12 text-gray-300 mx-auto my-4' />
                    <div className='text-sm text-gray-500 py-5'>{myFile.name}</div>
                    <button
                        onClick={() => setMyFile(null)}
                        className='
                    text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
                    >
                        Discard file
                    </button>
                </div>
            )}
        </div>
    );
};

const InnerDataUploadForm = ({
    accessToken,
    organism,
    clientConfig,
    action,
    onSuccess,
    onError,
    groupsOfUser,
}: DataUploadFormProps) => {
    const [metadataFile, setMetadataFile] = useState<File | null>(null);
    const [sequenceFile, setSequenceFile] = useState<File | null>(null);
    const [exampleEntries, setExampleEntries] = useState<number | undefined>(10);

    const noGroup = groupsOfUser.length === 0;

    const { submit, revise, isLoading } = useSubmitFiles(accessToken, organism, clientConfig, onSuccess, onError);
    const [selectedGroupName, setSelectedGroupName] = useState<string | undefined>(
        noGroup ? undefined : groupsOfUser[0].groupName,
    );
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
                const groupName = selectedGroupName ?? groupsOfUser[0].groupName;
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

    if (noGroup) {
        return (
            <div className='mt-6 message max-w-4xl'>
                <DashiconsGroups className='w-12 h-12 inline-block mr-2' />
                <div>
                    <p>
                        Sequences can only be submitted to the database by users who are part of a <i>group</i>.
                    </p>
                    <p className='mt-3'>
                        To submit to the database, please either{' '}
                        <a href={routes.createGroup()} className='underline'>
                            create a group
                        </a>{' '}
                        (a group with one member is not a problem!) or ask a group administrator to add you to an
                        existing group.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className='text-left mt-3 max-w-6xl'>
            <GroupSelector
                groupNames={groupsOfUser.map((group) => group.groupName)}
                selectedGroupName={selectedGroupName}
                setSelectedGroupName={setSelectedGroupName}
            />
            <div className='flex-col flex gap-8 divide-y'>
                <div className='grid sm:grid-cols-3 gap-x-16'>
                    <div className=''>
                        <h2 className='font-medium text-lg'>Sequences and metadata</h2>
                        <p className='text-gray-500 text-sm'>Select your sequence data and metadata files</p>

                        <p className='text-gray-800 text-xs mt-5 opacity-50'>
                            <MaterialSymbolsInfoOutline className='w-5 h-5 inline-block mr-2' />
                            {action === 'revise' && (
                                <span>
                                    <strong>
                                        For revisions, your metadata file must contain an "accession" column, with the
                                        accession in the database. <br />
                                    </strong>
                                </span>
                            )}
                            For more information on the format in which data should be uploaded and the required
                            metadata, please refer to our{' '}
                            <a href='#TODO-MVP' className='text-primary-700'>
                                help pages
                            </a>
                            .
                        </p>

                        {organism.startsWith('dummy-organism') && action === 'submit' && (
                            <DevExampleData
                                setExampleEntries={setExampleEntries}
                                exampleEntries={exampleEntries}
                                metadataFile={metadataFile}
                                sequenceFile={sequenceFile}
                                handleLoadExampleData={handleLoadExampleData}
                            />
                        )}
                    </div>
                    <form className='sm:col-span-2 '>
                        <div className='px-8'>
                            <div className='flex flex-col gap-6 max-w-64'>
                                <div className='sm:col-span-3'>
                                    <UploadComponent
                                        setFile={setSequenceFile}
                                        name='sequence_file'
                                        title='Sequence file'
                                        Icon={PhDnaLight}
                                        fileType='FASTA file'
                                    />
                                </div>
                                <div className='sm:col-span-3'>
                                    <UploadComponent
                                        setFile={setMetadataFile}
                                        name='metadata_file'
                                        title='Metadata file'
                                        Icon={MaterialSymbolsLightDataTableOutline}
                                        fileType='TSV file'
                                    />
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                {action !== 'revise' && (
                    <DataUseTerms
                        dataUseTermsType={dataUseTermsType}
                        setDataUseTermsType={setDataUseTermsType}
                        restrictedUntil={restrictedUntil}
                        setRestrictedUntil={setRestrictedUntil}
                    />
                )}
                <div className=' flex items-center justify-end gap-x-6 pt-3'>
                    <button
                        name='submit'
                        type='submit'
                        className='rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
                        onClick={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <div className='inline-block mr-2'>
                                <span className='loading loading-spinner loading-sm' />
                            </div>
                        ) : (
                            ''
                        )}
                        Submit sequences
                    </button>
                </div>
            </div>
        </div>
    );
};

export const DataUploadForm = withQueryProvider(InnerDataUploadForm);

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
