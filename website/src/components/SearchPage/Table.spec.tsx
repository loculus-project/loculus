import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, expect, test } from 'vitest';

import { Table, type TableSequenceData } from './Table';
import type { Schema } from '../../types/config';

const schema: Schema = {
    organismName: '',
    metadata: [{ name: 'id', type: 'string', displayName: 'ID' }],
    tableColumns: ['id'],
    primaryKey: 'id',
    defaultOrderBy: 'id',
    defaultOrder: 'ascending',
    inputFields: [],
    metadataTemplate: [],
    submissionDataTypes: { consensusSequences: true },
};

const data: TableSequenceData[] = [{ id: '1' }, { id: '2' }, { id: '3' }];

const TestWrapper = () => {
    const [selectedSeqs, setSelectedSeqs] = React.useState<Set<string>>(new Set());
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
            columnsToShow={['id']}
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
});
