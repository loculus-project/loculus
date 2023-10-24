import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sentenceCase } from 'change-case';
import { beforeEach, describe, expect, test } from 'vitest';

import { SequenceTable } from './SequenceTable.tsx';
import type { BulkSequenceActionName, SingleSequenceActionName } from './sequenceActions.ts';
import { testuser } from '../../../tests/e2e.fixture.ts';
import { routes } from '../../routes.ts';
import type { ClientConfig, SequenceStatus } from '../../types';
import { getSequenceVersionString } from '../../utils/extractSequenceVersion.ts';

const queryClient = new QueryClient();
const defaultSequencesWithStatus: readonly SequenceStatus[] = [
    {
        sequenceId: 1,
        version: 1,
        status: 'NEEDS_REVIEW',
        isRevocation: false,
    },
    {
        sequenceId: 2,
        version: 1,
        status: 'NEEDS_REVIEW',
        isRevocation: false,
    },
] as const;

const dummyConfig = { backendUrl: 'dummy' } as ClientConfig;
const everyBulkActionImplemented: readonly BulkSequenceActionName[] = [
    'delete',
    'approve',
    'revoke',
    'confirmRevocation',
] as const;
const everySingleActionImplemented: readonly SingleSequenceActionName[] = ['review'] as const;

function renderSequenceTable(
    sequencesWithStatus: SequenceStatus[] = [...defaultSequencesWithStatus],
    clientConfig: ClientConfig = dummyConfig,
) {
    render(
        <QueryClientProvider client={queryClient}>
            <SequenceTable
                username={testuser}
                sequences={sequencesWithStatus}
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

    test('should render each row with the sequence version and a single action', async () => {
        renderSequenceTable();

        everySingleActionImplemented.forEach((action) => {
            expect(screen.getAllByRole('button', { name: sentenceCase(action) }).length).toBe(
                defaultSequencesWithStatus.length,
            );
        });

        defaultSequencesWithStatus.map(getSequenceVersionString).forEach((sequenceVersion) => {
            expect(screen.getByText(sequenceVersion)).toBeInTheDocument();
        });
    });

    test('should delete sequences when delete is clicked', async () => {
        renderSequenceTable();

        const deleteButton = screen.getByRole('button', { name: sentenceCase('delete') });
        expect(deleteButton).toBeDisabled();

        const clickableRow = screen.getByText(getSequenceVersionString(defaultSequencesWithStatus[0]));
        await userEvent.click(clickableRow);

        expect(deleteButton).not.toBeDisabled();

        // jsdom cannot do HTMLDialogElements: https://github.com/testing-library/react-testing-library/issues/1106
        // await userEvent.click(deleteButton);
    });

    test('should navigate to review page when single action "review" is clicked', async () => {
        renderSequenceTable();

        const sequenceVersionToReview = defaultSequencesWithStatus[0];

        const reviewButton = screen.getAllByRole('button', { name: sentenceCase(everySingleActionImplemented[0]) })[0];
        expect(reviewButton).toBeDefined();
        await userEvent.click(reviewButton);

        expect(window.location.href).toBe(routes.reviewPage(testuser, sequenceVersionToReview));
    });
});
