/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/no-empty-function */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SearchFullUI } from './SearchFullUI';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import type { MetadataFilter, Schema } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';

global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
};

vi.mock('../../config', () => ({
    fetchAutoCompletion: vi.fn().mockResolvedValue([]),
    getLapisUrl: vi.fn().mockReturnValue('http://lapis.dummy.url'),
}));

const defaultSearchFormFilters: MetadataFilter[] = [
    {
        name: 'field1',
        type: 'string' as const,
        label: 'Field 1',
        autocomplete: false,
        initiallyVisible: true,
    },
    {
        name: 'field2',
        type: 'date' as const,
        autocomplete: false,
        label: 'Field 2',
        initiallyVisible: true,
    },
    {
        name: 'field3',
        type: 'pango_lineage' as const,
        label: 'Field 3',
        autocomplete: true,
        initiallyVisible: true,
    },
];

const defaultReferenceGenomesSequenceNames: ReferenceGenomesSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
};

function renderSearchFullUI({
    searchFormFilters = [...defaultSearchFormFilters],
    clientConfig = testConfig.public,
    referenceGenomesSequenceNames = defaultReferenceGenomesSequenceNames,
} = {}) {
    const metadataSchema: MetadataFilter[] = searchFormFilters.map((filter) => ({
        ...filter,
        grouped: false,
    }));

    const props = {
        accessToken: 'dummyAccessToken',
        referenceGenomesSequenceNames,
        myGroups: [],
        organism: testOrganism,
        clientConfig,
        schema: {
            metadata: metadataSchema,
            tableColumns: ['field1', 'field2', 'field3'],
            primaryKey: 'field1',
        } as Schema,
    };

    render(<SearchFullUI {...props} />);
}

describe('SearchFullUI', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: {
                href: '',
            },
        });
    });

    test('should render the form with all fields that are searchable', async () => {
        renderSearchFullUI();

        expect(screen.getByLabelText('Field 1')).toBeDefined();
        expect(screen.getByText('Field 2')).toBeDefined();
        expect(screen.getByLabelText('Field 3')).toBeDefined();
    });
    /*
    test('should redirect according to filters', async () => {
        renderSearchFullUI();

        const filterValue = 'test';
        const labelText = 'Field 1';
        // first click on Field 1, then type in it. use findByLabelText to wait for the field to appear
        await userEvent.click(await screen.findByLabelText(labelText));
        // send typing events
        // wait 1 sec
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        });
        await userEvent.type(document.activeElement as HTMLElement, filterValue);

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        });

        expect(window.history.state.path).toContain(`field1=${filterValue}`);
    });
*/
    test('should not render the form with fields with flag notSearchable', async () => {
        renderSearchFullUI({
            searchFormFilters: [
                ...defaultSearchFormFilters,
                {
                    name: 'NotSearchable',
                    type: 'string' as const,
                    autocomplete: false,
                    notSearchable: true,
                    initiallyVisible: true,
                },
            ],
        });

        expect(screen.getByLabelText('Field 1')).toBeDefined();
        expect(screen.queryByPlaceholderText('NotSearchable')).not.toBeInTheDocument();
    });

    test('should display timestamp field', async () => {
        const timestampFieldName = 'timestampField';
        renderSearchFullUI({
            searchFormFilters: [
                {
                    name: timestampFieldName,
                    type: 'timestamp' as const,
                    initiallyVisible: true,
                },
            ],
        });

        const timestampLabel = screen.getByText('Timestamp field');
        const timestampField = timestampLabel.nextElementSibling?.getElementsByTagName('input')[0];
        if (!timestampField) {
            throw new Error('Timestamp field not found');
        }
    });

    test('should display date field', async () => {
        const dateFieldName = 'dateField';
        renderSearchFullUI({
            searchFormFilters: [
                {
                    name: dateFieldName,
                    type: 'date' as const,
                    initiallyVisible: true,
                    rangeSearch: true,
                    displayName: 'Date field',
                },
            ],
        });

        const dateLabel = screen.getByText('Date field');
        const dateField = dateLabel.nextElementSibling?.getElementsByTagName('input')[0];
        if (!dateField) {
            throw new Error('Date field not found');
        }
    });
    /*
    test('toggle field visibility', async () => {
        renderSearchFullUI({});

        expect(await screen.findByLabelText('Field 1')).toBeVisible();

        const customizeButton = await screen.findByRole('button', { name: 'Customize fields' });
        await userEvent.click(customizeButton);

        const field1Checkbox = await screen.findByRole('checkbox', { name: 'Field 1' });
        expect(field1Checkbox).toBeChecked();

        await userEvent.click(field1Checkbox);

        const closeButton = await screen.findByRole('button', { name: 'Close' });
        await userEvent.click(closeButton);

        expect(screen.queryByLabelText('Field 1')).not.toBeInTheDocument();
    });
    */
});
