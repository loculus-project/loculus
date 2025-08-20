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

        fireEvent.mouseDown(checkboxes[0]);
        fireEvent.mouseEnter(checkboxes[1]);
        fireEvent.mouseEnter(checkboxes[2]);
        fireEvent.mouseUp(document.body);

        checkboxes.forEach((cb) => {
            expect(cb).toBeChecked();
        });
    });
});
