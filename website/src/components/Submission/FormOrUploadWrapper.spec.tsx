import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { FormOrUploadWrapper, type InputError, type SequenceData } from './FormOrUploadWrapper';
import type { InputField } from '../../types/config';

const DUMMY_METADATA_TEMPLATE_FIELDS = new Map<string, InputField[]>([
    [
        'Required Fields',
        [
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

describe('FormOrUploadWrapper', () => {
    describe('Form', () => {
        function renderForm(enableConsensusSequences: boolean): () => Promise<SequenceData | InputError> {
            let sequenceFileCreator: () => Promise<SequenceData | InputError>;
            render(
                <FormOrUploadWrapper
                    inputMode='form'
                    action='submit'
                    organism='foo'
                    fileCreatorSetter={(fileCreator) => {
                        sequenceFileCreator = fileCreator;
                    }}
                    referenceGenomeSequenceNames={{
                        nucleotideSequences: ['foo', 'bar'],
                        genes: [],
                        insdcAccessionFull: [],
                    }}
                    metadataTemplateFields={DUMMY_METADATA_TEMPLATE_FIELDS}
                    enableConsensusSequences={enableConsensusSequences}
                />,
            );
            return sequenceFileCreator!;
        }

        async function enterInputValue(label: string, value: string) {
            const input = screen.getByLabelText(`${label}:`);
            await userEvent.type(input, value);
            expect(input).toHaveValue(value);
        }

        test('renders all metadata fields and sequence segments', () => {
            renderForm(true);
            expect(screen.getByText(/Collection date/)).toBeTruthy();
            expect(screen.getByText(/Collection country/)).toBeTruthy();
            expect(screen.getByText(/Host/)).toBeTruthy();
            expect(screen.getByText(/foo/)).toBeTruthy();
            expect(screen.getByText(/bar/)).toBeTruthy();
        });

        test('error when nothing is entered', async () => {
            const sequenceFileGetter = renderForm(true);
            const sequenceFileResult = await sequenceFileGetter();
            expect(sequenceFileResult.type).toBe('error');
        });

        test('error when only metadata is entered', async () => {
            const sequenceFileGetter = renderForm(true);
            await enterInputValue('Host', 'human');
            const sequenceFileResult = await sequenceFileGetter();
            expect(sequenceFileResult.type).toBe('error');
        });

        test('error when only sequenceData is entered', async () => {
            const sequenceFileGetter = renderForm(true);
            await enterInputValue('foo', 'F');
            await enterInputValue('bar', 'B');
            const sequenceFileResult = await sequenceFileGetter();
            expect(sequenceFileResult.type).toBe('error');
        });

        test.only('ok when metadata and sequence data is entered', async () => {
            const sequenceFileGetter = renderForm(true);
            await enterInputValue('Host', 'human');
            await enterInputValue('foo', 'F');
            await enterInputValue('bar', 'B');
            const sequenceFileResult = await sequenceFileGetter();
            console.log(JSON.stringify(sequenceFileResult));
            expect(sequenceFileResult.type).toBe('ok');
        });

        test('does not render sequence section when consensus sequences are disabled', () => {
            renderForm(false);
            expect(screen.getByText(/Collection date/)).toBeTruthy();
            expect(screen.getByText(/Collection country/)).toBeTruthy();
            expect(screen.getByText(/Host/)).toBeTruthy();
            expect(screen.queryByText(/foo/)).toBeFalsy();
            expect(screen.queryByText(/bar/)).toBeFalsy();
        });

        test('TSV file contains all entered information', () => {});

        test('TSV file escapes entered data correctly', () => {});
    });
});
