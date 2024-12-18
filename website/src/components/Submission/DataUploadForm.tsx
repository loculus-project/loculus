import { isErrorFromAlias } from '@zodios/core';
import type { AxiosError } from 'axios';
import { DateTime } from 'luxon';
import { type ElementType, type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

import { dataUploadDocsUrl } from './dataUploadDocsUrl.ts';
import { getClientLogger } from '../../clientLogger.ts';
import DataUseTermsSelector from '../../components/DataUseTerms/DataUseTermsSelector';
import useClientFlag from '../../hooks/isClient.ts';
import { routes } from '../../routes/routes.ts';
import { backendApi } from '../../services/backendApi.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import {
    type DataUseTermsOption,
    type Group,
    openDataUseTermsOption,
    restrictedDataUseTermsOption,
} from '../../types/backend.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { dateTimeInMonths } from '../../utils/DateTimeInMonths.tsx';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError.ts';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import MaterialSymbolsInfoOutline from '~icons/material-symbols/info-outline';
import MaterialSymbolsLightDataTableOutline from '~icons/material-symbols-light/data-table-outline';
import PhDnaLight from '~icons/ph/dna-light';

export type UploadAction = 'submit' | 'revise';

type DataUploadFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    action: UploadAction;
    group: Group;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    onSuccess: () => void;
    onError: (message: string) => void;
};

const logger = getClientLogger('DataUploadForm');

const DataUseTerms = ({
    dataUseTermsType,
    setDataUseTermsType,
    setRestrictedUntil,
}: {
    dataUseTermsType: DataUseTermsOption;
    setDataUseTermsType: (dataUseTermsType: DataUseTermsOption) => void;
    setRestrictedUntil: (restrictedUntil: DateTime) => void;
}) => {
    return (
        <div className='grid sm:grid-cols-3 mt-0 pt-10'>
            <div>
                <h2 className='font-medium text-lg'>Data use terms</h2>
                <p className='text-gray-500 text-sm'>Choose how your data can be used</p>
            </div>
            <div className=' grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 col-span-2'>
                <div className='sm:col-span-4 px-8'>
                    <label htmlFor='username' className='block text-sm font-medium leading-6 text-gray-900'>
                        Terms of use for this data set
                    </label>
                    <div className='mt-2'>
                        <div className='mt-6 space-y-2'>
                            <DataUseTermsSelector
                                calendarUseModal
                                initialDataUseTermsOption={dataUseTermsType}
                                maxRestrictedUntil={dateTimeInMonths(12)}
                                setDataUseTerms={(terms) => {
                                    setDataUseTermsType(terms.type);
                                    if (terms.type === restrictedDataUseTermsOption) {
                                        setRestrictedUntil(DateTime.fromFormat(terms.restrictedUntil, 'yyyy-MM-dd'));
                                    }
                                }}
                            />
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

/**
 * always return a TSV file
 */
async function processFile(file: File): Promise<File> {
    switch (file.type) {
        case 'application/vnd.ms-excel':
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });

            const firstSheetName = workbook.SheetNames[1];
            const sheet = workbook.Sheets[firstSheetName];
            const tsvContent = XLSX.utils.sheet_to_csv(sheet, {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                FS: '\t',
                blankrows: false,
            });
            /* eslint-disable no-console */
            console.log('-----------------------------------');
            console.log(tsvContent);
            console.log('-----------------------------------');
            /* eslint-enable no-console */

            const tsvBlob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
            // TODO -> now if the underlying data changes, the converted file won't update
            const tsvFile = new File([tsvBlob], file.name, { type: 'text/tab-separated-values' });
            return tsvFile;
        }
        default:
            return file;
    }
}

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
    Icon: ElementType; // eslint-disable-line @typescript-eslint/naming-convention
    fileType: string;
}) => {
    const [myFileHandle, setMyFileHandle] = useState<File | null>(null);
    const [myFile, rawSetMyFile] = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const isClient = useClientFlag();

    const setMyFile = useCallback(
        async (file: File | null) => {
            setMyFileHandle(file);
            if (file !== null) {
                file = await processFile(file);
            }
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
        void setMyFile(file);
    };

    useEffect(() => {
        const interval = setInterval(() => {
            // Check if the file is no longer readable - which generally indicates the file has been edited since being
            // selected in the UI - and if so clear it.
            myFileHandle
                ?.slice(0, 1)
                .arrayBuffer()
                .catch(() => {
                    void setMyFile(null);
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                });
        }, 500);

        return () => clearInterval(interval);
    }, [myFileHandle, setMyFile]);
    return (
        <div className='sm:col-span-4'>
            <label className='text-gray-900 font-medium text-sm block'>{title}</label>
            {name === 'metadata_file' && (
                <div>
                    <span className='text-gray-500 text-xs'>
                        The documentation pages contain more details on the required
                    </span>
                    <a href='/docs/concepts/metadataformat' className='text-primary-700 text-xs'>
                        {' '}
                        metadata format{' '}
                    </a>
                </div>
            )}
            <div
                className={`mt-2 flex flex-col h-40 rounded-lg border ${myFile ? 'border-hidden' : 'border-dashed border-gray-900/25'} ${isDragOver && !myFile ? 'bg-green-100' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className='flex items-center justify-center'>
                    <Icon className='mx-auto mt-4 mb-0 h-12 w-12 text-gray-300' aria-hidden='true' />
                </div>
                {!myFile ? (
                    <div className='flex flex-col items-center justify-center flex-1 px-4 py-2'>
                        <div className='text-center'>
                            <label className='inline relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500'>
                                <span
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleUpload();
                                    }}
                                >
                                    Upload
                                </span>
                                {isClient && (
                                    <input
                                        id={name}
                                        name={name}
                                        type='file'
                                        className='sr-only'
                                        aria-label={title}
                                        data-testid={name}
                                        onChange={(event) => {
                                            const file = event.target.files?.[0] ?? null;
                                            void setMyFile(file);
                                        }}
                                        ref={fileInputRef}
                                    />
                                )}
                            </label>
                            <span className='pl-1'>or drag and drop</span>
                        </div>
                        <p className='text-sm pb+2 leading-5 text-gray-600'>{fileType}</p>
                    </div>
                ) : (
                    <div className='flex flex-col items-center justify-center text-center flex-1 px-4 py-2'>
                        <div className='text-sm text-gray-500 mb-1'>{myFile.name}</div>
                        <button
                            onClick={() => void setMyFile(null)}
                            data-testid={`discard_${name}`}
                            className='text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
                        >
                            Discard file
                        </button>
                    </div>
                )}
            </div>
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
    group,
    referenceGenomeSequenceNames,
}: DataUploadFormProps) => {
    const [metadataFile, setMetadataFile] = useState<File | null>(null);
    const [sequenceFile, setSequenceFile] = useState<File | null>(null);
    const [exampleEntries, setExampleEntries] = useState<number | undefined>(10);

    const { submit, revise, isLoading } = useSubmitFiles(accessToken, organism, clientConfig, onSuccess, onError);
    const [dataUseTermsType, setDataUseTermsType] = useState<DataUseTermsOption>(openDataUseTermsOption);
    const [restrictedUntil, setRestrictedUntil] = useState<DateTime>(dateTimeInMonths(6));

    const [agreedToINSDCUploadTerms, setAgreedToINSDCUploadTerms] = useState(false);

    const [confirmedNoPII, setConfirmedNoPII] = useState(false);

    const isClient = useClientFlag();

    const handleLoadExampleData = () => {
        const { metadataFileContent, revisedMetadataFileContent, sequenceFileContent } = getExampleData(exampleEntries);

        const exampleMetadataContent = action === `submit` ? metadataFileContent : revisedMetadataFileContent;

        const metadataFile = createTempFile(exampleMetadataContent, 'text/tab-separated-values', 'metadata.tsv');
        const sequenceFile = createTempFile(sequenceFileContent, 'application/octet-stream', 'sequences.fasta');

        setMetadataFile(metadataFile);
        setSequenceFile(sequenceFile);
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();

        if (!agreedToINSDCUploadTerms) {
            onError('Please tick the box to agree that you will not independently submit these sequences to INSDC');
            return;
        }

        if (!confirmedNoPII) {
            onError(
                'Please confirm the data you submitted does not include restricted or personally identifiable information.',
            );
            return;
        }

        if (!metadataFile) {
            onError('Please select metadata file');
            return;
        }
        if (!sequenceFile) {
            onError('Please select a sequences file');
            return;
        }

        switch (action) {
            case 'submit': {
                const groupId = group.groupId;
                submit({
                    metadataFile,
                    sequenceFile,
                    groupId,
                    dataUseTermsType,
                    restrictedUntil:
                        dataUseTermsType === restrictedDataUseTermsOption
                            ? restrictedUntil.toFormat('yyyy-MM-dd')
                            : null,
                });
                break;
            }
            case 'revise':
                revise({ metadataFile, sequenceFile });
                break;
        }
    };

    const isMultiSegmented = referenceGenomeSequenceNames.nucleotideSequences.length > 1;

    return (
        <div className='text-left mt-3 max-w-6xl'>
            <div className='flex-col flex gap-8 divide-y'>
                <div className='grid sm:grid-cols-3 gap-x-16'>
                    <div className=''>
                        <h2 className='font-medium text-lg'>Sequences and metadata</h2>
                        <p className='text-gray-500 text-sm'>Select your sequence data and metadata files</p>

                        <p className='text-gray-400 text-xs mt-5'>
                            <MaterialSymbolsInfoOutline className='w-5 h-5 inline-block mr-2' />
                            {action === 'revise' && (
                                <span>
                                    <strong>
                                        For revisions, your metadata file must contain an "accession" column, with the
                                        accession in the database. <br />
                                    </strong>
                                </span>
                            )}
                            You can download{' '}
                            <a
                                href={routes.metadataTemplate(organism, action)}
                                className='text-primary-700  opacity-90'
                            >
                                a template
                            </a>{' '}
                            for the TSV metadata file with column headings.
                        </p>

                        {isMultiSegmented && (
                            <p className='text-gray-400 text-xs mt-3'>
                                {organism.toUpperCase()} has a multi-segmented genome. Please submit one metadata entry
                                with a unique <i>submissionId</i> for the full multi-segmented sample, e.g.{' '}
                                <b>sample1</b>. Sequence data should be a FASTA file with each header indicating the{' '}
                                <i>submissionId</i> and the segment, i.e.{' '}
                                {referenceGenomeSequenceNames.nucleotideSequences.map((name, index) => (
                                    <span key={index} className='font-bold'>
                                        sample1_{name}
                                        {index !== referenceGenomeSequenceNames.nucleotideSequences.length - 1
                                            ? ', '
                                            : ''}
                                    </span>
                                ))}
                                .
                            </p>
                        )}

                        <p className='text-gray-400 text-xs mt-3'>
                            Files can optionally be compressed, with the appropriate extension (<i>.zst</i>, <i>.gz</i>,{' '}
                            <i>.zip</i>, <i>.xz</i>). For more information please refer to the{' '}
                            <a href={dataUploadDocsUrl} className='text-primary-700 opacity-90'>
                                help pages
                            </a>
                            .
                        </p>

                        {(organism.startsWith('not-aligned-organism') || organism.startsWith('dummy-organism')) &&
                            action === 'submit' && (
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
                        setRestrictedUntil={setRestrictedUntil}
                    />
                )}
                <div className='grid sm:grid-cols-3 gap-x-16 pt-10'>
                    <div className=''>
                        <h2 className='font-medium text-lg'>Acknowledgement</h2>
                        <p className='text-gray-500 text-sm'>Acknowledge submission terms</p>
                    </div>
                    <div className='sm:col-span-2  grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 col-span-2'>
                        <div className='sm:col-span-4 px-8'>
                            {dataUseTermsType === restrictedDataUseTermsOption && (
                                <p className='block text-sm'>
                                    Your data will be available on Pathoplexus, under the restricted use terms until{' '}
                                    {restrictedUntil.toFormat('yyyy-MM-dd')}. After the restricted period your data will
                                    additionally be made publicly available through the{' '}
                                    <a href='https://www.insdc.org/' className='text-primary-600 hover:underline'>
                                        INSDC
                                    </a>{' '}
                                    databases (ENA, DDBJ, NCBI).
                                </p>
                            )}
                            {dataUseTermsType === openDataUseTermsOption && (
                                <p className='block text-sm'>
                                    Your data will be available on Pathoplexus under the open use terms. It will
                                    additionally be made publicly available through the{' '}
                                    <a href='https://www.insdc.org/' className='text-primary-600 hover:underline'>
                                        INSDC
                                    </a>{' '}
                                    databases (ENA, DDBJ, NCBI).
                                </p>
                            )}
                            <div className='mt-2 py-5'>
                                <label className='flex items-center'>
                                    <input
                                        type='checkbox'
                                        name='confirmation-no-pii'
                                        className='mr-3 ml-1 h-5 w-5 rounded border-gray-300 text-blue focus:ring-blue'
                                        checked={confirmedNoPII}
                                        onChange={() => setConfirmedNoPII(!confirmedNoPII)}
                                    />
                                    <div>
                                        <p className='text-xs pl-4 text-gray-500'>
                                            I confirm that the data submitted is not sensitive or human-identifiable
                                        </p>
                                    </div>
                                </label>
                            </div>
                            <div className='mb-4 py-3'>
                                <label className='flex items-center'>
                                    <input
                                        type='checkbox'
                                        name='confirmation-INSDC-upload-terms'
                                        className='mr-3 ml-1 h-5 w-5 rounded border-gray-300 text-blue focus:ring-blue'
                                        checked={agreedToINSDCUploadTerms}
                                        onChange={() => setAgreedToINSDCUploadTerms(!agreedToINSDCUploadTerms)}
                                    />
                                    <div>
                                        <p className='text-xs pl-4 text-gray-500'>
                                            I confirm I have not and will not submit this data independently to INSDC,
                                            to avoid data duplication. I agree to Loculus handling the submission of
                                            this data to INSDC.{' '}
                                            <a
                                                href='/docs/concepts/insdc-submission'
                                                className='text-primary-600 hover:underline'
                                            >
                                                Find out more.
                                            </a>
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className='flex items-center justify-end gap-x-6 pt-3'>
                    <button
                        name='submit'
                        type='submit'
                        className='rounded-md py-2 text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 bg-primary-600 text-white hover:bg-primary-500'
                        onClick={handleSubmit}
                        disabled={isLoading || !isClient}
                    >
                        <div className={`absolute ml-1.5 inline-flex ${isLoading ? 'visible' : 'invisible'}`}>
                            <span className='loading loading-spinner loading-sm' />
                        </div>
                        <span className='flex-1 text-center mx-8'>Submit sequences</span>
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

function handleError(onError: (message: string) => void, action: UploadAction) {
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

function createTempFile(content: BlobPart, mimeType: string | undefined, fileName: string) {
    const blob = new Blob([content], { type: mimeType });
    return new File([blob], fileName, { type: mimeType });
}
