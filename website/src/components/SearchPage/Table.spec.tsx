import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, test } from 'vitest';

import { Table, type TableSequenceData } from './Table';
import type { Schema } from '../../types/config';

const schema: Schema = {
    organismName: '',
    metadata: [
        { name: 'id', type: 'string', displayName: 'ID' },
        { name: 'country', type: 'string' },
        { name: 'host', type: 'string' },
        { name: 'length', type: 'int' },
        { name: 'coverage', type: 'float' },
        { name: 'isRevocation', type: 'boolean' },
    ],
    tableColumns: ['id', 'country', 'host', 'length', 'coverage', 'isRevocation'],
    primaryKey: 'id',
    defaultOrderBy: 'id',
    defaultOrder: 'ascending',
    inputFields: [],
    metadataTemplate: [],
    submissionDataTypes: { consensusSequences: true },
};

const data: TableSequenceData[] = [
    { id: '1', country: 'Switzerland', length: 29903, coverage: 0.5, isRevocation: true },
    { id: '2', country: null, isRevocation: false },
    { id: '3' },
];

const TestWrapper = () => {
    const [selectedSeqs, setSelectedSeqs] = React.useState(new Set<string>());
    return (
        <Table
            schema={schema}
            data={data}
            selectedSeqs={selectedSeqs}
            setSelectedSeqs={setSelectedSeqs}
            previewedSeqId={null}
            setPreviewedSeqId={() => {}}
            orderBy={{ field: 'id', type: 'ascending' }}
            setOrderByField={() => {}}
            setOrderDirection={() => {}}
            columnsToShow={['country', 'host', 'length', 'coverage', 'isRevocation']}
        />
    );
};

describe('Table', () => {
    test('allows selecting multiple checkboxes by dragging', () => {
        render(<TestWrapper />);
        const checkboxes = screen.getAllByRole('checkbox');
        // Events are handled on the parent td, not the checkbox itself
        const checkboxCells = checkboxes.map((cb) => cb.parentElement!);

        fireEvent.mouseDown(checkboxCells[0], { clientY: 100 });
        fireEvent.mouseEnter(checkboxCells[1], { clientY: 150 });
        fireEvent.mouseEnter(checkboxCells[2], { clientY: 200 });
        fireEvent.mouseUp(document.body);

        checkboxes.forEach((cb) => {
            expect(cb).toBeChecked();
        });
    });

    test('formats cell values by type', () => {
        render(<TestWrapper />);
        const rows = screen.getAllByTestId('sequence-row').map((row) =>
            within(row)
                .getAllByRole('cell')
                .slice(2)
                .map((cell) => cell.textContent),
        );

        expect(rows).toEqual([
            ['Switzerland', '', '29,903', '0.5', 'True'],
            ['', '', '', '', 'False'],
            ['', '', '', '', ''],
        ]);
    });
});
