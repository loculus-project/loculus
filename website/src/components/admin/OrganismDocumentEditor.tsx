import { useState } from 'react';

import { ConfirmDialog } from './ConfirmDialog';
import { PublishModal } from './PublishModal';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { AdminConfigClient, AdminConfigError, canonicalOrganismConfig } from '../../services/adminConfigClient';
import type { CanonicalOrganismConfig, OrganismDraftResponse, PublishResponse } from '../../types/loculusConfig';
import { Button } from '../common/Button';

interface Props {
    accessToken: string;
    backendUrl: string;
    organismKey: string;
    initialDraft: OrganismDraftResponse | null;
    seedConfig: CanonicalOrganismConfig;
}

export function OrganismDocumentEditor({ accessToken, backendUrl, organismKey, initialDraft, seedConfig }: Props) {
    const initialText = JSON.stringify(initialDraft?.config ?? seedConfig, null, 2);
    const [text, setText] = useState<string>(() => initialText);
    const [revision, setRevision] = useState<number | undefined>(initialDraft?.revision);
    const [parseError, setParseError] = useState<string | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [publishResult, setPublishResult] = useState<PublishResponse | null>(null);
    const [discardOpen, setDiscardOpen] = useState(false);
    const client = new AdminConfigClient(accessToken, backendUrl);
    useUnsavedGuard(text !== initialText);

    const parsed = (): CanonicalOrganismConfig | null => {
        let json: unknown;
        try {
            json = JSON.parse(text);
        } catch (e) {
            setParseError(`JSON parse error: ${(e as Error).message}`);
            return null;
        }
        const result = canonicalOrganismConfig.safeParse(json);
        if (!result.success) {
            setParseError(
                `Schema error: ${result.error.issues
                    .slice(0, 5)
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; ')}`,
            );
            return null;
        }
        setParseError(null);
        return result.data;
    };

    const onSave = async () => {
        setServerError(null);
        const config = parsed();
        if (config === null) return;
        setBusy(true);
        try {
            const { revision: newRevision } = await client.putOrganismDraft(organismKey, config, revision);
            setRevision(newRevision);
        } catch (e) {
            setServerError(formatError(e));
        } finally {
            setBusy(false);
        }
    };

    const onPublish = async () => {
        setServerError(null);
        const config = parsed();
        if (config === null) return;
        setBusy(true);
        try {
            const { revision: newRevision } = await client.putOrganismDraft(organismKey, config, revision);
            setRevision(newRevision);
            const result = await client.publishOrganism(organismKey);
            setPublishResult(result);
        } catch (e) {
            setServerError(formatError(e));
        } finally {
            setBusy(false);
        }
    };

    const onDiscardConfirmed = async () => {
        setBusy(true);
        try {
            await client.discardOrganismDraft(organismKey);
            window.location.reload();
        } catch (e) {
            setServerError(formatError(e));
            setBusy(false);
            setDiscardOpen(false);
        }
    };

    return (
        <div className='space-y-3'>
            <div className='flex gap-4 items-baseline'>
                <h2 className='text-lg font-semibold font-mono'>{organismKey}</h2>
                <span className='text-sm text-gray-500'>
                    {revision !== undefined ? `draft revision ${revision}` : 'no draft yet'}
                </span>
            </div>

            <p className='text-sm text-gray-600'>
                Paste or edit the full <code className='font-mono text-xs'>OrganismConfig</code> as JSON. Save to
                persist the draft; Publish to release it as version 1.
            </p>

            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className='font-mono text-xs w-full h-[60vh] border border-gray-300 rounded p-2'
                spellCheck={false}
            />

            {parseError !== null && <p className='text-sm text-red-600 whitespace-pre-wrap'>{parseError}</p>}
            {serverError !== null && <p className='text-sm text-red-600'>{serverError}</p>}

            <div className='flex gap-2'>
                <Button
                    type='button'
                    disabled={busy}
                    onClick={() => void onSave()}
                    className='bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded text-sm'
                >
                    {busy ? 'Working…' : 'Save draft'}
                </Button>
                <Button
                    type='button'
                    disabled={busy}
                    onClick={() => void onPublish()}
                    className='bg-primary-700 hover:bg-primary-800 text-white px-3 py-1.5 rounded text-sm'
                >
                    Publish v1
                </Button>
                {initialDraft !== null && (
                    <Button
                        type='button'
                        disabled={busy}
                        onClick={() => setDiscardOpen(true)}
                        className='text-red-700 hover:underline text-sm ml-auto'
                    >
                        Discard draft
                    </Button>
                )}
            </div>

            {publishResult !== null && (
                <PublishModal
                    result={publishResult}
                    organismKey={organismKey}
                    onClose={() => {
                        window.location.href = `/admin/config/organisms/${encodeURIComponent(organismKey)}/edit`;
                    }}
                />
            )}
            {discardOpen && (
                <ConfirmDialog
                    title='Discard organism draft?'
                    message={
                        <span>
                            All unpublished changes to <span className='font-mono'>{organismKey}</span> will be lost.
                            This cannot be undone.
                        </span>
                    }
                    confirmLabel='Discard'
                    destructive
                    busy={busy}
                    onConfirm={() => void onDiscardConfirmed()}
                    onCancel={() => setDiscardOpen(false)}
                />
            )}
        </div>
    );
}

function formatError(e: unknown): string {
    if (AdminConfigError.isInstance(e)) {
        if (e.body.error === 'revision_conflict') {
            return 'Revision conflict — someone else edited this draft. Please reload and try again.';
        }
        if (e.body.error === 'operation_validation_failed' && e.body.errors !== undefined) {
            return e.body.errors.map((err) => `${err.path}: ${err.message}`).join('; ');
        }
        return e.body.message ?? e.body.error;
    }
    return e instanceof Error ? e.message : String(e);
}
