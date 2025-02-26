import { isErrorFromAlias } from '@zodios/core';
import type { AxiosError } from 'axios';
import { DateTime } from 'luxon';
import { type FormEvent, useState } from 'react';

import { dataUploadDocsUrl } from './dataUploadDocsUrl.ts';
import { getClientLogger } from '../../clientLogger.ts';
import type { ColumnMapping } from './FileUpload/ColumnMapping.ts';
import { ColumnMappingModal } from './FileUpload/ColumnMappingModal.tsx';
import { UploadComponent } from './FileUpload/UploadComponent.tsx';
import { metadataFormatDocsUrl } from './metadataFormatDocsUrl.ts';
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
import { FASTA_FILE_KIND, METADATA_FILE_KIND, type ProcessedFile, RawFile } from './FileUpload/fileProcessing.ts';
import type { InputField } from '../../types/config.ts';
import type { SubmissionDataTypes } from '../../types/config.ts';

export type UploadAction = 'submit' | 'revise';

type DataUploadFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    action: UploadAction;
    group: Group;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    metadataTemplateFields: Map<string, InputField[]>;
    onSuccess: () => void;
    onError: (message: string) => void;
    submissionDataTypes: SubmissionDataTypes;
    dataUseTermsEnabled: boolean;
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
    handleLoadExampleData,
    dataIsLoaded,
}: {
    setExampleEntries: (entries: number) => void;
    exampleEntries: number | undefined;
    handleLoadExampleData: () => void;
    dataIsLoaded: boolean;
}) => {
    return (
        <p className='text-gray-800 text-xs mt-5 opacity-50'>
            Add dev example data
            <br />
            <input
                type='number'
                value={exampleEntries ?? ''}
                onChange={(event) => setExampleEntries(parseInt(event.target.value, 10))}
                className='w-32 h-6 rounded'
            />
            <button type='button' onClick={handleLoadExampleData} className='border rounded px-2 py-1 ml-2 h-6'>
                Load Example Data
            </button>{' '}
            <br />
            {dataIsLoaded && <span className='text-xs text-gray-500'>Data loaded</span>}
        </p>
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
    metadataTemplateFields,
    submissionDataTypes,
    dataUseTermsEnabled,
}: DataUploadFormProps) => {
    const [metadataFile, setMetadataFile] = useState<ProcessedFile | undefined>(undefined);
    // The columnMapping can be null; if null -> don't apply mapping.
    const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
    const [sequenceFile, setSequenceFile] = useState<ProcessedFile | undefined>(undefined);
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
        setMetadataFile(new RawFile(metadataFile));

        if (submissionDataTypes.consensusSequences) {
            const sequenceFile = createTempFile(sequenceFileContent, 'application/octet-stream', 'sequences.fasta');
            setSequenceFile(new RawFile(sequenceFile));
        }
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        if (dataUseTermsEnabled && !agreedToINSDCUploadTerms) {
            onError('Please tick the box to agree that you will not independently submit these sequences to INSDC');
            return;
        }

        if (dataUseTermsEnabled && !confirmedNoPII) {
            onError(
                'Please confirm the data you submitted does not include restricted or personally identifiable information.',
            );
            return;
        }

        if (!metadataFile) {
            onError('Please select metadata file');
            return;
        }
        if (!sequenceFile && submissionDataTypes.consensusSequences) {
            onError('Please select a sequences file');
            return;
        }

        let finalMetadataFile = metadataFile.inner();

        if (columnMapping !== null) {
            finalMetadataFile = await columnMapping.applyTo(metadataFile);
        }

        switch (action) {
            case 'submit': {
                const groupId = group.groupId;
                submit({
                    metadataFile: finalMetadataFile,
                    sequenceFile: sequenceFile?.inner(),
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
                revise({ metadataFile: finalMetadataFile, sequenceFile: sequenceFile?.inner() });
                break;
        }
    };

    const isMultiSegmented = referenceGenomeSequenceNames.nucleotideSequences.length > 1;

    return (
        <div className='text-left mt-3 max-w-6xl'>
            <div className='flex-col flex gap-8 divide-y'>
                <div className='grid sm:grid-cols-3 gap-x-16'>
                    <div className=''>
                        <h2 className='font-medium text-lg'>
                            {submissionDataTypes.consensusSequences ? 'Sequences and metadata' : 'Metadata'}
                        </h2>
                        <p className='text-gray-500 text-sm'>
                            Select your {submissionDataTypes.consensusSequences && 'sequence data and '}metadata files
                        </p>
                        <p className='text-gray-400 text-xs mt-5'>
                            {action === 'revise' && (
                                <span>
                                    <strong>
                                        For revisions, your metadata file must contain an "accession" column, with the
                                        accession in the database. <br />
                                    </strong>
                                </span>
                            )}
                            The documentation pages contain more details on the required{' '}
                            <a href={metadataFormatDocsUrl} className='text-primary-700 opacity-90'>
                                metadata format
                            </a>{' '}
                            including a list of all supported metadata. You can download a{' '}
                            <a
                                href={routes.metadataTemplate(organism, action, 'tsv')}
                                className='text-primary-700 opacity-90'
                            >
                                TSV
                            </a>
                            {' or '}
                            <a
                                href={routes.metadataTemplate(organism, action, 'xlsx')}
                                className='text-primary-700 opacity-90'
                            >
                                XLSX
                            </a>{' '}
                            template with column headings for the metadata file.
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
                            Files can optionally be compressed using <i>.zst</i>, <i>.zip</i> or <i>.gz</i>; for FASTA
                            files <i>.xz</i> is also supported. For more information please refer to the{' '}
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
                                    handleLoadExampleData={handleLoadExampleData}
                                    dataIsLoaded={
                                        !!metadataFile && (!submissionDataTypes.consensusSequences || !!sequenceFile)
                                    }
                                />
                            )}
                    </div>
                    <form className='sm:col-span-2'>
                        <div className='flex flex-col lg:flex-row gap-6'>
                            {submissionDataTypes.consensusSequences && (
                                <div className='w-60 space-y-2'>
                                    <label className='text-gray-900 font-medium text-sm block'>Sequence File</label>
                                    <UploadComponent
                                        setFile={setSequenceFile}
                                        name='sequence_file'
                                        ariaLabel='Sequence File'
                                        fileKind={FASTA_FILE_KIND}
                                    />
                                </div>
                            )}
                            <div className='w-60 space-y-2'>
                                <label className='text-gray-900 font-medium text-sm block'>Metadata File</label>
                                <div className='flex flex-col items-center w-full'>
                                    <UploadComponent
                                        setFile={setMetadataFile}
                                        name='metadata_file'
                                        ariaLabel='Metadata File'
                                        fileKind={METADATA_FILE_KIND}
                                    />
                                    {metadataFile !== undefined && (
                                        <ColumnMappingModal
                                            inputFile={metadataFile}
                                            columnMapping={columnMapping}
                                            setColumnMapping={setColumnMapping}
                                            groupedInputFields={metadataTemplateFields}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                {action === 'submit' && dataUseTermsEnabled && (
                    <DataUseTerms
                        dataUseTermsType={dataUseTermsType}
                        setDataUseTermsType={setDataUseTermsType}
                        setRestrictedUntil={setRestrictedUntil}
                    />
                )}
                {dataUseTermsEnabled && (
                    <div className='grid sm:grid-cols-3 gap-x-16 pt-10'>
                        <div className=''>
                            <h2 className='font-medium text-lg'>Acknowledgement</h2>
                            <p className='text-gray-500 text-sm'>Acknowledge submission terms</p>
                        </div>
                        <div className='sm:col-span-2  grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 col-span-2'>
                            <div className='sm:col-span-4 px-8'>
                                {dataUseTermsType === restrictedDataUseTermsOption && (
                                    <p className='block text-sm'>
                                        Until the end of the restricted period ({restrictedUntil.toFormat('yyyy-MM-dd')}
                                        ), your data will be available on Pathoplexus under the{' '}
                                        <a
                                            href='/about/terms-of-use/restricted-data'
                                            className='text-primary-600 hover:underline'
                                            target='_blank'
                                            rel='noopener noreferrer'
                                        >
                                            restricted
                                        </a>
                                        terms of use. After the restricted period, the data will be available under the{' '}
                                        <a
                                            href='/about/terms-of-use/open-data'
                                            className='text-primary-600 hover:underline'
                                            target='_blank'
                                            rel='noopener noreferrer'
                                        >
                                            open
                                        </a>{' '}
                                        terms of use, and will also be made publicly available through the{' '}
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
                                                I confirm I have not and will not submit this data independently to
                                                INSDC, to avoid data duplication. I agree to Pathoplexus handling the
                                                submission of this data to INSDC.{' '}
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
                )}
                <div className='flex justify-end gap-x-6 pt-3 mt-auto'>
                    <button
                        name='submit'
                        type='submit'
                        className='rounded-md py-2 text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 bg-primary-600 text-white hover:bg-primary-500'
                        onClick={(e) => void handleSubmit(e)}
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
