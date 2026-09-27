import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fflate from 'fflate';
import { type Result } from 'neverthrow';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import type { FileMapping } from './FileUpload/fileMapping';
import { FormOrUploadWrapper, type FileFactory, type InputMode, type SequenceData } from './FormOrUploadWrapper';
import { FILES_HEADER_PREFIX, SUBMISSION_ID_INPUT_FIELD } from '../../settings';
import type { InputField, SubmissionDataTypes } from '../../types/config';
import { Button } from '../common/Button';

const DUMMY_METADATA_TEMPLATE_FIELDS = new Map<string, InputField[]>([
    [
        'Required Fields',
        [
            {
                name: SUBMISSION_ID_INPUT_FIELD,
                displayName: 'ID',
                noEdit: true,
            },
            {
                name: 'collectionDate',
                displayName: 'Collection date',
            },
            {
                name: 'collectionCountry',
                displayName: 'Collection country',
            },
        ],
    ],
    [
        'Extra fields',
        [
            {
                name: 'host',
                displayName: 'Host',
            },
        ],
    ],
]);

const valueOf = <T,>(result: Result<T, Error>): T => {
    if (result.isErr()) throw new Error(`expected a success, got: ${result.error.message}`);
    return result.value;
};

const errorMessageOf = <T,>(result: Result<T, Error>): string => {
    if (result.isOk()) throw new Error('expected a failure, got a success');
    return result.error.message;
};

const RAW_READS = 'rawReads';
const RAW_READS_COLUMN = `${FILES_HEADER_PREFIX}${RAW_READS}`;

/* The template fields as they are configured in bulk mode: the file categories are offered as
 * input fields there, so a column mapping can keep the files column. */
const BULK_METADATA_TEMPLATE_FIELDS = new Map<string, InputField[]>([
    ...DUMMY_METADATA_TEMPLATE_FIELDS,
    ['Files', [{ name: RAW_READS_COLUMN, displayName: 'Raw reads' }]],
]);

const FILES_ENABLED: SubmissionDataTypes['files'] = { enabled: true, categories: [{ name: RAW_READS }] };

const MockSaveWrapper = ({
    inputMode,
    submissionDataTypes,
    fileMapping,
    metadataTemplateFields = DUMMY_METADATA_TEMPLATE_FIELDS,
    fileReceiver,
}: {
    inputMode: InputMode;
    submissionDataTypes: SubmissionDataTypes;
    fileMapping?: FileMapping;
    metadataTemplateFields?: Map<string, InputField[]>;
    fileReceiver: (file: Result<SequenceData, Error>) => void;
}) => {
    const [fileFactory, setFileFactory] = useState<FileFactory | undefined>(undefined);

    //eslint-disable-next-line @typescript-eslint/no-misused-promises
    const handler: React.MouseEventHandler<HTMLButtonElement> = async () => {
        const result = await fileFactory!();
        fileReceiver(result);
    };

    return (
        <>
            <FormOrUploadWrapper
                inputMode={inputMode}
                action='submit'
                organism='foo'
                setFileFactory={setFileFactory}
                metadataTemplateFields={metadataTemplateFields}
                submissionDataTypes={submissionDataTypes}
                setSubmissionFileMapping={vi.fn()}
                onError={vi.fn()}
                fileSharingConfig={{ disableStrictFilenameValidation: false }}
                fileMapping={fileMapping}
            />
            <Button onClick={handler}>generate</Button>
        </>
    );
};

const fileCallback = vi.fn();

async function generateFiles(): Promise<Result<SequenceData, Error>> {
    await userEvent.click(screen.getByText('generate'));
    expect(fileCallback.mock.calls.length).toBe(1);
    const callArgs = fileCallback.mock.calls[0];
    fileCallback.mockClear();
    expect(callArgs.length).toBe(1);
    return callArgs[0] as Result<SequenceData, Error>;
}

async function rowsOf(sequenceData: SequenceData): Promise<string[]> {
    return (await sequenceData.metadataFile.text()).trim().split('\n');
}

describe('FormOrUploadWrapper', () => {
    describe('Bulk', () => {
        const gzippedMetadataFile = (content: string) =>
            new File([fflate.gzipSync(new TextEncoder().encode(content))], 'metadata.tsv.gz');

        async function uploadMetadataFile(file: File, fileMapping?: FileMapping) {
            render(
                <MockSaveWrapper
                    inputMode='bulk'
                    submissionDataTypes={{ consensusSequences: false, maxSequencesPerEntry: 1, files: FILES_ENABLED }}
                    fileMapping={fileMapping}
                    metadataTemplateFields={BULK_METADATA_TEMPLATE_FIELDS}
                    fileReceiver={fileCallback}
                />,
            );
            await userEvent.upload(screen.getByTestId('metadata_file'), file);
            await waitFor(() => expect(screen.getByText(file.name)).toBeInTheDocument());
        }

        async function addColumnMapping() {
            await userEvent.click(screen.getByText(/Add column mapping/i));
            await screen.findByText(/Column in your file/i);
            await userEvent.click(screen.getByText(/Add this mapping/i));
            await waitFor(() => expect(screen.getByText(/Edit column mapping/i)).toBeInTheDocument());
        }

        test('writes file IDs into a gzipped metadata file', async () => {
            const metadata = `id\t${RAW_READS_COLUMN}\ne1\ta.txt\n`;
            const fileMapping: FileMapping = new Map([[RAW_READS, new Map([['a.txt', 'id-a']])]]);

            await uploadMetadataFile(gzippedMetadataFile(metadata), fileMapping);

            const sequenceData = valueOf(await generateFiles());
            expect(await rowsOf(sequenceData)).toEqual([`id\t${RAW_READS_COLUMN}`, 'e1\ta.txt:id-a']);
        });

        test('writes file IDs into a gzipped metadata file with a column mapping applied', async () => {
            const metadata = `submissionId\t${RAW_READS_COLUMN}\ne1\ta.txt\n`;
            const fileMapping: FileMapping = new Map([[RAW_READS, new Map([['a.txt', 'id-a']])]]);

            await uploadMetadataFile(gzippedMetadataFile(metadata), fileMapping);
            await addColumnMapping();

            const sequenceData = valueOf(await generateFiles());
            expect(await rowsOf(sequenceData)).toEqual([`id\t${RAW_READS_COLUMN}`, 'e1\ta.txt:id-a']);
        });

        test('error when the metadata file cannot be read', async () => {
            const notActuallyGzipped = new File(['id\trawReads\ne1\ta.txt\n'], 'metadata.tsv.gz');

            await uploadMetadataFile(notActuallyGzipped);

            expect(errorMessageOf(await generateFiles())).toContain('Could not read the metadata file');
        });

        test('error when a file declared in the metadata was not uploaded', async () => {
            const metadata = `id\t${RAW_READS_COLUMN}\ne1\ta.txt\n`;

            await uploadMetadataFile(gzippedMetadataFile(metadata));

            expect(errorMessageOf(await generateFiles())).toBe(
                `The following ${RAW_READS} files were referenced in metadata but not uploaded: a.txt.`,
            );
        });
    });

    describe('Form', () => {
        function renderForm(enableConsensusSequences: boolean, fileMapping?: FileMapping) {
            render(
                <MockSaveWrapper
                    inputMode='form'
                    submissionDataTypes={{
                        consensusSequences: enableConsensusSequences,
                        maxSequencesPerEntry: 2,
                        files: fileMapping !== undefined ? FILES_ENABLED : undefined,
                    }}
                    fileMapping={fileMapping}
                    fileReceiver={fileCallback}
                />,
            );
        }

        async function enterInputValue(label: string, value: string) {
            const input = screen.getByLabelText(label);
            await userEvent.type(input, value);
            expect(input).toHaveValue(value);
        }

        async function uploadSegmentData(fastaHeader: string, data: string) {
            const fasta = `>${fastaHeader}\n${data}`;
            const file = new File([fasta], 'foo.fasta', { type: 'text/plain' });
            const uploadInput = () => screen.getByLabelText(new RegExp('Add a segment', 'i'));
            await waitFor(() => expect(uploadInput()).toBeVisible());
            await userEvent.upload(uploadInput(), file);
        }
        test('renders all metadata fields and sequence segments', () => {
            renderForm(true);
            expect(screen.getByText(/ID/)).toBeTruthy();
            const collectionDateLabel = document.querySelector('label[for="collectionDate"]');
            expect(collectionDateLabel).toHaveTextContent('Collection date');
            const collectionCountryLabel = document.querySelector('label[for="collectionCountry"]');
            expect(collectionCountryLabel).toHaveTextContent('Collection country');
            expect(screen.getByText(/Host/)).toBeTruthy();
        });

        test('error when nothing is entered', async () => {
            renderForm(true);
            expect(errorMessageOf(await generateFiles())).toBe('Please specify an ID.');
        });

        test('error when only ID is entered', async () => {
            renderForm(true);
            await enterInputValue('ID', 'foo');
            expect(errorMessageOf(await generateFiles())).toBe('Please specify metadata.');
        });

        test('error when only metadata is entered', async () => {
            renderForm(true);
            await enterInputValue('Host', 'human');
            expect(errorMessageOf(await generateFiles())).toBe('Please specify an ID.');
        });

        test('error when only ID and metadata is entered', async () => {
            renderForm(true);
            await enterInputValue('ID', 'foo');
            await enterInputValue('Host', 'human');
            expect(errorMessageOf(await generateFiles())).toBe('Please enter sequence data.');
        });

        test('error when only sequenceData is entered', async () => {
            renderForm(true);
            await uploadSegmentData('foo', 'ACTG');
            await uploadSegmentData('bar', 'ACTG');
            expect(errorMessageOf(await generateFiles())).toBe('Please specify an ID.');
        });

        test('error when ID is omitted', async () => {
            renderForm(true);
            await enterInputValue('Host', 'human');
            await uploadSegmentData('foo', 'ACTG');
            await uploadSegmentData('bar', 'ACTG');
            expect(errorMessageOf(await generateFiles())).toBe('Please specify an ID.');
        });

        test('ok when submission ID, metadata and sequence data is entered', async () => {
            renderForm(true);
            await enterInputValue('ID', 'foo');
            await enterInputValue('Host', 'human');
            await uploadSegmentData('foo', 'ACTG');
            await uploadSegmentData('bar', 'ACTG');
            expect((await generateFiles()).isOk()).toBe(true);
        });

        test('does not render sequence section when consensus sequences are disabled', () => {
            renderForm(false);
            expect(screen.getByText(/ID/)).toBeTruthy();
            const collectionDateLabel = document.querySelector('label[for="collectionDate"]');
            expect(collectionDateLabel).toHaveTextContent('Collection date');
            const collectionCountryLabel = document.querySelector('label[for="collectionCountry"]');
            expect(collectionCountryLabel).toHaveTextContent('Collection country');
            expect(screen.getByText(/Host/)).toBeTruthy();
            expect(screen.queryByText(/foo/)).toBeFalsy();
            expect(screen.queryByText(/bar/)).toBeFalsy();
        });

        test('TSV file contains all entered information', async () => {
            renderForm(false);
            await enterInputValue('ID', 'foo');
            await enterInputValue('Collection country', 'Kenia');
            await enterInputValue('Collection date', '2021-05-17');
            await enterInputValue('Host', 'google');
            const sequenceFile = valueOf(await generateFiles());
            const tsvRows = (await sequenceFile.metadataFile.text()).trim().split('\n');
            expect(tsvRows.length).toBe(2);
            expect(tsvRows[0]).toBe('id\tcollectionCountry\tcollectionDate\thost');
            expect(tsvRows[1]).toBe('foo\tKenia\t2021-05-17\tgoogle');
        });

        test('TSV file escapes entered data correctly', async () => {
            renderForm(false);
            await enterInputValue('ID', 'foo');
            await enterInputValue('Collection country', 'Foo\tBar');
            const sequenceFile = valueOf(await generateFiles());
            const tsvRows = (await sequenceFile.metadataFile.text()).trim().split('\n');
            expect(tsvRows.length).toBe(2);
            expect(tsvRows[0]).toBe('id\tcollectionCountry');
            expect(tsvRows[1]).toBe('foo\t"Foo\tBar"');
        });

        test('TSV file contains the file IDs of the uploaded files', async () => {
            renderForm(false, new Map([[RAW_READS, new Map([['a.txt', 'id-a']])]]));
            await enterInputValue('ID', 'foo');
            await enterInputValue('Collection country', 'Kenia');
            const sequenceData = valueOf(await generateFiles());
            expect(await rowsOf(sequenceData)).toEqual([
                `id\tcollectionCountry\t${RAW_READS_COLUMN}`,
                'foo\tKenia\ta.txt:id-a',
            ]);
        });

        test('error when a file was uploaded whose name is not allowed', async () => {
            renderForm(false, new Map([[RAW_READS, new Map([['../a.txt', 'id-a']])]]));
            await enterInputValue('ID', 'foo');
            await enterInputValue('Collection country', 'Kenia');
            expect(errorMessageOf(await generateFiles())).toContain('Encountered errors in submitted file names');
        });
    });
});
