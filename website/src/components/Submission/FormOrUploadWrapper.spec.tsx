import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { FormOrUploadWrapper, type FileFactory, type InputError, type SequenceData } from './FormOrUploadWrapper';
import { SUBMISSION_ID_INPUT_FIELD } from '../../settings';
import type { InputField } from '../../types/config';
import { SINGLE_REFERENCE } from '../../types/referencesGenomes.ts';

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

const MockSaveWrapper = ({
    enableConsensusSequences,
    fileReceiver,
}: {
    enableConsensusSequences: boolean;
    fileReceiver: (file: SequenceData | InputError) => void;
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
                inputMode='form'
                action='submit'
                organism='foo'
                setFileFactory={setFileFactory}
                referenceGenomeLightweightSchema={{
                    [SINGLE_REFERENCE]: {
                        nucleotideSegmentNames: ['foo', 'bar'],
                        geneNames: [],
                        insdcAccessionFull: [],
                    },
                }}
                metadataTemplateFields={DUMMY_METADATA_TEMPLATE_FIELDS}
                submissionDataTypes={{
                    consensusSequences: enableConsensusSequences,
                }}
            />
            <button onClick={handler}>generate</button>
        </>
    );
};

describe('FormOrUploadWrapper', () => {
    describe('Form', () => {
        const fileCallback = vi.fn();

        function renderForm(enableConsensusSequences: boolean) {
            render(<MockSaveWrapper enableConsensusSequences={enableConsensusSequences} fileReceiver={fileCallback} />);
        }

        async function generateFiles(): Promise<SequenceData | InputError> {
            await userEvent.click(screen.getByText('generate'));
            expect(fileCallback.mock.calls.length).toBe(1);
            const callArgs = fileCallback.mock.calls[0];
            fileCallback.mockClear();
            expect(callArgs.length).toBe(1);
            return callArgs[0] as SequenceData | InputError;
        }

        async function enterInputValue(label: string, value: string) {
            const input = screen.getByLabelText(label);
            await userEvent.type(input, value);
            expect(input).toHaveValue(value);
        }

        async function uploadSegmentData(data: string) {
            const file = new File([data], 'foo.txt', { type: 'text/plain' });
            const uploadInput = () => screen.getByLabelText(new RegExp('\\+ add new sequence segment file', 'i'));
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
            expect(screen.getByText(/\+ add new sequence/)).toBeTruthy();
        });

        test('error when nothing is entered', async () => {
            renderForm(true);
            const sequenceFileResult = await generateFiles();
            expect(sequenceFileResult.type).toBe('error');
        });

        test('error when only ID is entered', async () => {
            renderForm(true);
            await enterInputValue('ID', 'foo');
            const sequenceFileResult = await generateFiles();
            expect(sequenceFileResult.type).toBe('error');
        });

        test('error when only metadata is entered', async () => {
            renderForm(true);
            await enterInputValue('Host', 'human');
            const sequenceFileResult = await generateFiles();
            expect(sequenceFileResult.type).toBe('error');
        });

        test('error when only ID and metadata is entered', async () => {
            renderForm(true);
            await enterInputValue('ID', 'foo');
            await enterInputValue('Host', 'human');
            const sequenceFileResult = await generateFiles();
            expect(sequenceFileResult.type).toBe('error');
        });

        test('error when only sequenceData is entered', async () => {
            renderForm(true);
            await uploadSegmentData('ACTG');
            await uploadSegmentData('ACTG');
            const sequenceFileResult = await generateFiles();
            expect(sequenceFileResult.type).toBe('error');
        });

        test('error when ID is omitted', async () => {
            renderForm(true);
            await enterInputValue('Host', 'human');
            await uploadSegmentData('ACTG');
            await uploadSegmentData('ACTG');
            const sequenceFileResult = await generateFiles();
            expect(sequenceFileResult.type).toBe('error');
        });

        test('ok when submission ID, metadata and sequence data is entered', async () => {
            renderForm(true);
            await enterInputValue('ID', 'foo');
            await enterInputValue('Host', 'human');
            await uploadSegmentData('ACTG');
            await uploadSegmentData('ACTG');
            const sequenceFileResult = await generateFiles();
            expect(sequenceFileResult.type).toBe('ok');
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
            const sequenceFileResult = await generateFiles();
            expect(sequenceFileResult.type).toBe('ok');
            const sequenceFile = sequenceFileResult as SequenceData;
            const tsvRows = (await sequenceFile.metadataFile.text()).trim().split('\n');
            expect(tsvRows.length).toBe(2);
            expect(tsvRows[0]).toBe('id\tcollectionCountry\tcollectionDate\thost');
            expect(tsvRows[1]).toBe('foo\tKenia\t2021-05-17\tgoogle');
        });

        test('TSV file escapes entered data correctly', async () => {
            renderForm(false);
            await enterInputValue('ID', 'foo');
            await enterInputValue('Collection country', 'Foo\tBar');
            const sequenceFileResult = await generateFiles();
            expect(sequenceFileResult.type).toBe('ok');
            const sequenceFile = sequenceFileResult as SequenceData;
            const tsvRows = (await sequenceFile.metadataFile.text()).trim().split('\n');
            expect(tsvRows.length).toBe(2);
            expect(tsvRows[0]).toBe('id\tcollectionCountry');
            expect(tsvRows[1]).toBe('foo\t"Foo\tBar"');
        });
    });
});
