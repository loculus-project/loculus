import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sentenceCase } from 'change-case';
import { beforeEach, describe, expect, test } from 'vitest';

import { SequenceEntryTable } from './SequenceEntryTable.tsx';
import type { BulkSequenceActionName, SingleSequenceActionName } from './sequenceActions.ts';
import { openDataUseTerms } from '../../../tests/e2e.fixture.ts';
import { testAccessToken, testOrganism } from '../../../vitest.setup.ts';
import { routes } from '../../routes.ts';
import type { SequenceEntryStatus } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';

const queryClient = new QueryClient();
const defaultSequenceEntryStatuses: readonly SequenceEntryStatus[] = [
    {
        accession: '1',
        version: 1,
        status: 'HAS_ERRORS',
        isRevocation: false,
        submissionId: 'custom1',
        dataUseTerms: openDataUseTerms,
    },
    {
        accession: '2',
        version: 1,
        status: 'HAS_ERRORS',
        isRevocation: false,
        submissionId: 'custom2',
        dataUseTerms: openDataUseTerms,
    },
];

const dummyConfig = { backendUrl: 'dummy' } as ClientConfig;
const everyBulkActionImplemented: readonly BulkSequenceActionName[] = [
    'delete',
    'approve',
    'revoke',
    'confirmRevocation',
];
const everySingleActionImplemented: readonly SingleSequenceActionName[] = ['edit'];

function renderSequenceTable(
    sequencesWithStatus: SequenceEntryStatus[] = [...defaultSequenceEntryStatuses],
    clientConfig: ClientConfig = dummyConfig,
) {
    render(
        <QueryClientProvider client={queryClient}>
            <SequenceEntryTable
                organism={testOrganism}
                accessToken={testAccessToken}
                sequenceEntries={sequencesWithStatus}
                bulkActionNames={[...everyBulkActionImplemented]}
                singleActionNames={[...everySingleActionImplemented]}
                clientConfig={clientConfig}
            />
        </QueryClientProvider>,
    );
}

describe('SequenceTable', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: {
                href: '',
            },
        });
    });

    test('should render the table with bulk actions', async () => {
        renderSequenceTable();

        everyBulkActionImplemented.forEach((action) => {
            expect(screen.getByRole('button', { name: sentenceCase(action) })).toBeInTheDocument();
        });
    });

    test('should render each row with the accession version and a single action', async () => {
        renderSequenceTable();

        everySingleActionImplemented.forEach((action) => {
            expect(screen.getAllByRole('button', { name: sentenceCase(action) }).length).toBe(
                defaultSequenceEntryStatuses.length,
            );
        });

        defaultSequenceEntryStatuses.map(getAccessionVersionString).forEach((accessionVersion) => {
            expect(screen.getByText(accessionVersion)).toBeInTheDocument();
        });
    });

    test('should delete sequences when delete is clicked', async () => {
        renderSequenceTable();

        const deleteButton = screen.getByRole('button', { name: sentenceCase('delete') });
        expect(deleteButton).toBeDisabled();

        const clickableRow = screen.getByText(getAccessionVersionString(defaultSequenceEntryStatuses[0]));
        await userEvent.click(clickableRow);

        expect(deleteButton).not.toBeDisabled();

        // jsdom cannot do HTMLDialogElements: https://github.com/testing-library/react-testing-library/issues/1106
        // await userEvent.click(deleteButton);
    });

    test('should navigate to edit page when single action "edit" is clicked', async () => {
        renderSequenceTable();

        const accessionVersionToEdit = defaultSequenceEntryStatuses[0];

        const editButton = screen.getAllByRole('button', { name: sentenceCase(everySingleActionImplemented[0]) })[0];
        expect(editButton).toBeDefined();
        await userEvent.click(editButton);

        expect(window.location.href).toBe(routes.editPage(testOrganism, accessionVersionToEdit));
    });
});
