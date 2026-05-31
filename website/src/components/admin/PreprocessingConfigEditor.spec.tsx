import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { PreprocessingConfigEditor } from './PreprocessingConfigEditor';
import { testServer } from '../../../vitest.setup';

const backendUrl = 'http://backend.dummy';
const key = 'test-organism';

describe('PreprocessingConfigEditor', () => {
    it('saves edited content via PUT text/plain', async () => {
        let putBody: string | null = null;
        let putVersion: string | null = null;
        testServer.use(
            http.put(
                `${backendUrl}/api/admin/config/organisms/${key}/preprocessing/:version`,
                async ({ request, params }) => {
                    putBody = await request.text();
                    putVersion = params.version as string;
                    return new HttpResponse(null, { status: 204 });
                },
            ),
        );

        const user = userEvent.setup();
        render(
            <PreprocessingConfigEditor
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialConfigs={[{ pipelineVersion: 1, content: 'old: value' }]}
            />,
        );

        const textarea = screen.getByLabelText('Config file for pipeline version 1');
        // Save is disabled until the content changes.
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        await user.type(textarea, '\nnew: line');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(putBody).not.toBeNull());
        expect(putVersion).toBe('1');
        expect(putBody).toBe('old: value\nnew: line');
    });

    it('adds a new pipeline version and saves it', async () => {
        const puts: { version: string; body: string }[] = [];
        testServer.use(
            http.put(
                `${backendUrl}/api/admin/config/organisms/${key}/preprocessing/:version`,
                async ({ request, params }) => {
                    puts.push({ version: params.version as string, body: await request.text() });
                    return new HttpResponse(null, { status: 204 });
                },
            ),
        );

        const user = userEvent.setup();
        render(
            <PreprocessingConfigEditor
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialConfigs={[]}
            />,
        );

        await user.type(screen.getByLabelText('New pipeline version'), '2');
        await user.click(screen.getByRole('button', { name: 'Add' }));

        const textarea = await screen.findByLabelText('Config file for pipeline version 2');
        await user.type(textarea, 'hello: world');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(puts).toHaveLength(1));
        expect(puts[0]).toEqual({ version: '2', body: 'hello: world' });
    });

    it('rejects a duplicate pipeline version', async () => {
        const user = userEvent.setup();
        render(
            <PreprocessingConfigEditor
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialConfigs={[{ pipelineVersion: 1, content: 'x' }]}
            />,
        );

        await user.type(screen.getByLabelText('New pipeline version'), '1');
        await user.click(screen.getByRole('button', { name: 'Add' }));

        // Still only the original version 1 section is present.
        expect(screen.getAllByText(/Pipeline version 1/)).toHaveLength(1);
    });

    it('deletes a persisted config after confirmation', async () => {
        let deleted: string | null = null;
        testServer.use(
            http.delete(`${backendUrl}/api/admin/config/organisms/${key}/preprocessing/:version`, ({ params }) => {
                deleted = params.version as string;
                return new HttpResponse(null, { status: 204 });
            }),
        );

        const user = userEvent.setup();
        render(
            <PreprocessingConfigEditor
                accessToken='token'
                backendUrl={backendUrl}
                organismKey={key}
                initialConfigs={[{ pipelineVersion: 3, content: 'x' }]}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Remove' }));
        const dialog = screen.getByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

        await waitFor(() => expect(deleted).toBe('3'));
        expect(screen.queryByLabelText('Config file for pipeline version 3')).not.toBeInTheDocument();
    });
});
