import { useState, type Dispatch, type FC, type SetStateAction } from 'react';

import { routes } from '../../../routes/routes';
import type { UploadAction } from '../DataUploadForm';
import { metadataFormatDocsUrl } from '../metadataFormatDocsUrl';
import { ColumnMappingModal } from './ColumnMappingModal';
import { FileUploadComponent } from './FileUploadComponent';
import { FASTA_FILE_KIND, METADATA_FILE_KIND, RawFile, type ProcessedFile } from './fileProcessing';
import type { InputField } from '../../../types/config';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes';
import { dataUploadDocsUrl } from '../dataUploadDocsUrl';
import type { ColumnMapping } from './ColumnMapping';

type SequenceEntryUploadProps = {
    organism: string;
    action: UploadAction;
    metadataFile: ProcessedFile | undefined;
    setMetadataFile: Dispatch<SetStateAction<ProcessedFile | undefined>>;
    sequenceFile: ProcessedFile | undefined;
    setSequenceFile: Dispatch<SetStateAction<ProcessedFile | undefined>>;
    columnMapping: ColumnMapping | null;
    setColumnMapping: Dispatch<SetStateAction<ColumnMapping | null>>;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    metadataTemplateFields: Map<string, InputField[]>;
    enableConsensusSequences: boolean;
    isMultiSegmented: boolean;
};

/**
 * The component used in the submission form where the user can upload their FASTA and metadata file.
 */
export const SequenceEntryUpload: FC<SequenceEntryUploadProps> = ({
    organism,
    action,
    metadataFile,
    setMetadataFile,
    sequenceFile,
    setSequenceFile,
    columnMapping,
    setColumnMapping,
    referenceGenomeSequenceNames,
    metadataTemplateFields,
    enableConsensusSequences,
    isMultiSegmented,
}) => {
    const [exampleEntries, setExampleEntries] = useState<number | undefined>(10);

    const handleLoadExampleData = () => {
        const { metadataFileContent, revisedMetadataFileContent, sequenceFileContent } = getExampleData(exampleEntries);

        const exampleMetadataContent = action === `submit` ? metadataFileContent : revisedMetadataFileContent;

        const metadataFile = createTempFile(exampleMetadataContent, 'text/tab-separated-values', 'metadata.tsv');
        setMetadataFile(new RawFile(metadataFile));

        if (enableConsensusSequences) {
            const sequenceFile = createTempFile(sequenceFileContent, 'application/octet-stream', 'sequences.fasta');
            setSequenceFile(new RawFile(sequenceFile));
        }
    };

    return (
        <div className='grid sm:grid-cols-3 gap-x-16'>
            <div className=''>
                <h2 className='font-medium text-lg'>
                    {enableConsensusSequences ? 'Sequences and metadata' : 'Metadata'}
                </h2>
                <p className='text-gray-500 text-sm'>
                    Select your {enableConsensusSequences && 'sequence data and '}metadata files
                </p>
                <p className='text-gray-400 text-xs mt-5'>
                    {action === 'revise' && (
                        <span>
                            <strong>
                                For revisions, your metadata file must contain an "accession" column, with the accession
                                in the database. <br />
                            </strong>
                        </span>
                    )}
                    The documentation pages contain more details on the required{' '}
                    <a href={metadataFormatDocsUrl} className='text-primary-700 opacity-90'>
                        metadata format
                    </a>{' '}
                    including a list of all supported metadata. You can download a{' '}
                    <a href={routes.metadataTemplate(organism, action, 'tsv')} className='text-primary-700 opacity-90'>
                        TSV
                    </a>
                    {' or '}
                    <a href={routes.metadataTemplate(organism, action, 'xlsx')} className='text-primary-700 opacity-90'>
                        XLSX
                    </a>{' '}
                    template with column headings for the metadata file.
                </p>

                {isMultiSegmented && (
                    <p className='text-gray-400 text-xs mt-3'>
                        {organism.toUpperCase()} has a multi-segmented genome. Please submit one metadata entry with a
                        unique <i>submissionId</i> for the full multi-segmented sample, e.g. <b>sample1</b>. Sequence
                        data should be a FASTA file with each header indicating the <i>submissionId</i> and the segment,
                        i.e.{' '}
                        {referenceGenomeSequenceNames.nucleotideSequences.map((name, index) => (
                            <span key={index} className='font-bold'>
                                sample1_{name}
                                {index !== referenceGenomeSequenceNames.nucleotideSequences.length - 1 ? ', ' : ''}
                            </span>
                        ))}
                        .
                    </p>
                )}

                <p className='text-gray-400 text-xs mt-3'>
                    Files can optionally be compressed using <i>.zst</i>, <i>.zip</i> or <i>.gz</i>; for FASTA files{' '}
                    <i>.xz</i> is also supported. For more information please refer to the{' '}
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
                            dataIsLoaded={!!metadataFile && (!enableConsensusSequences || !!sequenceFile)}
                        />
                    )}
            </div>
            <form className='sm:col-span-2'>
                <div className='flex flex-col lg:flex-row gap-6'>
                    {enableConsensusSequences && (
                        <div className='w-60 space-y-2'>
                            <label className='text-gray-900 font-medium text-sm block'>Sequence file</label>
                            <FileUploadComponent
                                setFile={setSequenceFile}
                                name='sequence_file'
                                ariaLabel='Sequence File'
                                fileKind={FASTA_FILE_KIND}
                            />
                        </div>
                    )}
                    <div className='w-60 space-y-2'>
                        <label className='text-gray-900 font-medium text-sm block'>Metadata file</label>
                        <div className='flex flex-col items-center w-full'>
                            <FileUploadComponent
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
