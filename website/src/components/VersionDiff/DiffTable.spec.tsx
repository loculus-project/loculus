import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

import { DiffTable } from './DiffTable';
import { compareVersionData } from './compareVersions';
import type { TableDataEntry } from '../SequenceDetailsPage/types';

function deletions(mutations: string[]): TableDataEntry {
    return {
        name: 'nucleotideDeletions',
        label: 'Deletions',
        header: 'Sequence changes',
        value: '',
        type: { kind: 'mutation' },
        customDisplay: { type: 'list', list: [{ segment: 'main', mutations }] },
    };
}

const props = {
    comparison: compareVersionData(
        { tableData: [deletions(['10-12', '20'])] },
        { tableData: [deletions(['20', '30'])] },
    ),
    version1: 1,
    version2: 2,
    hideUnchangedFields: true,
};

test('renders full mutation values without a toggle when no setter is supplied', () => {
    const page = render(<DiffTable {...props} />);
    expect(page.getByText('10-12, 20')).toBeVisible();
    expect(page.getByText('20, 30')).toBeVisible();
    expect(page.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('filters shared mutations with a toggle even under a custom section header', async () => {
    function TableWithToggle() {
        const [mutationsDiffOnly, setMutationsDiffOnly] = useState(false);
        return <DiffTable {...props} {...{ mutationsDiffOnly, setMutationsDiffOnly }} />;
    }
    const user = userEvent.setup();
    const page = render(<TableWithToggle />);
    await user.click(page.getByRole('checkbox', { name: 'Hide shared substitutions/indels' }));
    expect(page.queryByText(/\b20\b/)).not.toBeInTheDocument();
    expect(page.getByText('10-12')).toBeVisible();
    expect(page.getByText('30')).toBeVisible();
});

test('does not treat a metadata field under the nucleotide mutations header as a mutation', () => {
    const field: TableDataEntry = {
        name: 'country',
        label: 'Country',
        header: 'Nucleotide mutations',
        value: 'Switzerland',
        type: { kind: 'metadata', metadataType: 'string' },
    };
    const comparison = compareVersionData({ tableData: [] }, { tableData: [field] });
    const page = render(<DiffTable {...props} comparison={comparison} setMutationsDiffOnly={vi.fn()} />);
    expect(page.getByText('Switzerland')).toBeVisible();
    expect(page.queryByRole('checkbox')).not.toBeInTheDocument();
});
