import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { EditOrganismSection } from './EditOrganismSection';
import { testServer } from '../../../vitest.setup';
import { canonicalOrganismConfig } from '../../services/adminConfigClient';
import type { OperationRequest, OrganismDraftResponse } from '../../types/loculusConfig';

const backendUrl = 'http://backend.dummy';
const key = 'test-organism';

const config = canonicalOrganismConfig.parse({
    schema: {
        organismName: 'test-organism',
        metadata: [
            { name: 'country', type: 'string' },
            { name: 'date', type: 'date' },
        ],
        linkOuts: [{ name: 'NCBI', url: 'http://ncbi/accession' }],
    },
    referenceGenome: { nucleotideSequences: [{ name: 'main', sequence: 'A' }], genes: [] },
});

const draft: OrganismDraftResponse = { config, baseVersion: 1, revision: 5, operations: [] };

function mockApi(capture: (op: OperationRequest) => void) {
    testServer.use(
        http.post(`${backendUrl}/api/admin/config/organisms/${key}/draft/operations`, async ({ request }) => {
            const body = (await request.json()) as { operations: OperationRequest[] };
            capture(body.operations[0]);
            return HttpResponse.json({ revision: 6 });
        }),
        http.get(`${backendUrl}/api/admin/config/organisms/${key}/draft`, () => HttpResponse.json(draft)),
    );
}

describe('EditOrganismSection', () => {
    it('posts setMetadataFieldDisplay when a metadata row is edited', async () => {
        let op: OperationRequest | null = null;
        mockApi((o) => (op = o));

        const user = userEvent.setup();
        render(
            <EditOrganismSection
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialDraft={draft}
                formKind='metadata'
            />,
        );

        const row = screen.getByText('country').closest('tr')!;
        // Inputs in the row, in DOM order: displayName, header, description.
        const inputs = within(row).getAllByRole('textbox');
        await user.type(inputs[0], 'Country');
        await user.click(within(row).getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(op).not.toBeNull());
        expect(op!.type).toBe('setMetadataFieldDisplay');
        expect(op!.payload).toEqual({ field: 'country', displayName: 'Country' });
    });

    it('posts reorderMetadataFields when the order is changed and applied', async () => {
        let op: OperationRequest | null = null;
        mockApi((o) => (op = o));

        const user = userEvent.setup();
        render(
            <EditOrganismSection
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialDraft={draft}
                formKind='metadata'
            />,
        );

        // Move `date` up so the order becomes [date, country].
        await user.click(screen.getByRole('button', { name: 'Move date up' }));
        await user.click(screen.getByRole('button', { name: 'Apply order' }));

        await waitFor(() => expect(op).not.toBeNull());
        expect(op!.type).toBe('reorderMetadataFields');
        expect(op!.payload).toEqual({ order: ['date', 'country'] });
    });

    it('posts updateLinkOut when an existing link-out is edited', async () => {
        let op: OperationRequest | null = null;
        mockApi((o) => (op = o));

        const user = userEvent.setup();
        render(
            <EditOrganismSection
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialDraft={draft}
                formKind='linkouts'
            />,
        );

        const row = screen.getByText('NCBI').closest('li')!;
        const urlInput = within(row).getByDisplayValue('http://ncbi/accession');
        await user.clear(urlInput);
        await user.type(urlInput, 'http://updated');
        await user.click(within(row).getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(op).not.toBeNull());
        expect(op!.type).toBe('updateLinkOut');
        expect(op!.payload).toEqual({ name: 'NCBI', url: 'http://updated' });
    });

    it('display formKind seeds inputs from publishedConfig, not from the post-op draft', () => {
        // Draft already has a pending op that renamed the organism to "Draft Name".
        const draftConfig = { ...config, displayName: 'Draft Name' };
        const draftWithEdit: OrganismDraftResponse = {
            config: draftConfig,
            baseVersion: 1,
            revision: 7,
            operations: [
                {
                    opType: 'setOrganismDisplay',
                    summary: "Set display name to 'Draft Name'",
                    appliedAt: '2026-05-28T00:00:00Z',
                    appliedBy: 'alice',
                },
            ],
        };
        // Published is still the original.
        const published = { ...config, displayName: 'Published Name' };

        render(
            <EditOrganismSection
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialDraft={draftWithEdit}
                publishedConfig={published}
                formKind='display'
            />,
        );

        // Input shows the *published* value, not the post-op draft value.
        expect(screen.getByDisplayValue('Published Name')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('Draft Name')).not.toBeInTheDocument();
        // The "pending in draft" hint surfaces the draft value for context.
        expect(screen.getByText(/Pending in draft: "Draft Name"/)).toBeInTheDocument();
    });

    it('display formKind falls back to schema.organismName when displayName is unset', () => {
        // Legacy import flow: only schema.organismName is set; top-level displayName is null.
        const legacyConfig = canonicalOrganismConfig.parse({
            schema: {
                organismName: 'CCHF (Multi-Ref)',
                metadata: [{ name: 'date', type: 'date' }],
            },
            referenceGenome: { nucleotideSequences: [{ name: 'main', sequence: 'A' }], genes: [] },
        });
        const legacyDraft: OrganismDraftResponse = {
            config: legacyConfig,
            baseVersion: 1,
            revision: 0,
            operations: [],
        };

        render(
            <EditOrganismSection
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialDraft={legacyDraft}
                publishedConfig={legacyConfig}
                formKind='display'
            />,
        );

        expect(screen.getByDisplayValue('CCHF (Multi-Ref)')).toBeInTheDocument();
    });

    it('overview formKind shows pending ops and a collapsible JSON viewer', () => {
        const draftWithOps: OrganismDraftResponse = {
            ...draft,
            operations: [
                {
                    opType: 'setOrganismDisplay',
                    summary: "Set display name to 'Test'",
                    appliedAt: '2026-05-28T00:00:00Z',
                    appliedBy: 'alice',
                },
            ],
        };

        render(
            <EditOrganismSection
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialDraft={draftWithOps}
                formKind='overview'
            />,
        );

        expect(screen.getByText('Pending operations')).toBeInTheDocument();
        expect(screen.getByText(/Set display name/)).toBeInTheDocument();
        expect(screen.getByText(/1 pending change/)).toBeInTheDocument();
        // Collapsible JSON details element is present.
        expect(screen.getByText(/Current draft config/)).toBeInTheDocument();
    });
});
