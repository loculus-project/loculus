import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { InstanceConfigEditor } from './InstanceConfigEditor';
import { testServer } from '../../../vitest.setup';
import { canonicalInstanceConfig } from '../../services/adminConfigClient';

const backendUrl = 'http://backend.dummy';

const published = canonicalInstanceConfig.parse({
    name: 'Test Instance',
    accessionPrefix: 'TEST_',
    dataUseTerms: { enabled: true, urls: null },
    fileSharing: {},
});

describe('InstanceConfigEditor', () => {
    it('PUTs the full config with typed-form edits applied', async () => {
        let captured: { config: Record<string, unknown> } | null = null;
        testServer.use(
            http.put(`${backendUrl}/api/admin/config/instance/draft`, async ({ request }) => {
                captured = (await request.json()) as { config: Record<string, unknown> };
                return HttpResponse.json({ revision: 1 });
            }),
        );

        const user = userEvent.setup();
        render(
            <InstanceConfigEditor
                accessToken='token'
                backendUrl={backendUrl}
                initialDraft={null}
                publishedConfig={published}
            />,
        );

        await user.type(screen.getByLabelText('Banner message'), 'Hello world');
        await user.click(screen.getByLabelText('Enable SeqSets'));

        const saveButton = screen.getByRole('button', { name: 'Save draft' });
        await waitFor(() => expect(saveButton).toBeEnabled());
        await user.click(saveButton);

        await waitFor(() => expect(captured).not.toBeNull());
        expect(captured!.config.bannerMessage).toBe('Hello world');
        expect(captured!.config.enableSeqSets).toBe(true);
        // Untouched required fields are preserved.
        expect(captured!.config.name).toBe('Test Instance');
        expect(captured!.config.accessionPrefix).toBe('TEST_');
    });
});
