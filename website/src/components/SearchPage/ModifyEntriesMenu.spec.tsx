import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SequenceEntrySelection } from './DownloadDialog/SequenceFilters';
import { ModifyEntriesMenu } from './ModifyEntriesMenu';
import type { ClientConfig } from '../../types/runtimeConfig';

// The data use terms dialog loads the current terms as soon as it is mounted, which it is
// (closed) whenever that action is on offer.
vi.mock('../../services/serviceHooks', () => ({
    lapisClientHooks: () => ({
        useDetails: () => ({ mutate: vi.fn(), isPending: false, error: null, data: undefined }),
    }),
    backendClientHooks: () => ({}),
}));

const clientConfig: ClientConfig = { backendUrl: 'http://backend', lapisUrls: {} };

const renderMenu = (props: Partial<Parameters<typeof ModifyEntriesMenu>[0]> = {}) =>
    render(
        <ModifyEntriesMenu
            sequenceFilter={new SequenceEntrySelection(new Set(['SEQID1', 'SEQID2']))}
            clientConfig={clientConfig}
            lapisUrl='http://lapis'
            accessToken='token'
            showEditDataUseTerms={false}
            submittedDataDownload={{
                backendUrl: 'http://backend',
                organism: 'ebola-sudan',
                groupId: 1,
                totalSequences: 2,
                fetchAccessions: vi.fn(),
            }}
            {...props}
        />,
    );

describe('ModifyEntriesMenu', () => {
    it('keeps its actions behind a single button until opened', async () => {
        renderMenu();

        expect(screen.getByRole('button', { name: /^Modify/ })).toBeVisible();
        expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /^Modify/ }));

        expect(screen.getByRole('menuitem', { name: /for bulk revision/ })).toBeVisible();
    });

    it('describes the submitted-data download by what it is for and how much it covers', async () => {
        renderMenu();
        await userEvent.click(screen.getByRole('button', { name: /^Modify/ }));

        expect(screen.getByRole('menuitem', { name: 'Download 2 selected entries for bulk revision' })).toBeVisible();
    });

    it('gathers both ways of modifying entries under the one button', async () => {
        renderMenu({ showEditDataUseTerms: true });
        await userEvent.click(screen.getByRole('button', { name: /^Modify/ }));

        expect(screen.getByRole('menuitem', { name: /Edit data use terms \(2 sequences\)/ })).toBeVisible();
        expect(screen.getByRole('menuitem', { name: /for bulk revision/ })).toBeVisible();
    });

    it('offers only the download when data use terms are not editable', async () => {
        renderMenu({ showEditDataUseTerms: false });
        await userEvent.click(screen.getByRole('button', { name: /^Modify/ }));

        expect(screen.getAllByRole('menuitem')).toHaveLength(1);
        expect(screen.queryByRole('menuitem', { name: /data use terms/ })).not.toBeInTheDocument();
    });

    it('omits the download when there is no group to download it from', async () => {
        renderMenu({ submittedDataDownload: undefined });
        await userEvent.click(screen.getByRole('button', { name: /^Modify/ }));

        expect(screen.queryByRole('menuitem', { name: /for bulk revision/ })).not.toBeInTheDocument();
    });
});
