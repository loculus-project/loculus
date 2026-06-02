import { useState } from 'react';
import { toast } from 'react-toastify';

import { ConfirmDialog } from './ConfirmDialog';
import { DraftStatusBanner } from './DraftStatusBanner';
import { JsonViewer } from './JsonViewer';
import { PendingOpsList } from './PendingOpsList';
import { PublishModal } from './PublishModal';
import { AddOptionalMetadataFieldForm } from './forms/AddOptionalMetadataFieldForm';
import { LinkOutsForm } from './forms/LinkOutsForm';
import { MetadataFieldsManager } from './forms/MetadataFieldsManager';
import { SetOrganismDisplayForm } from './forms/SetOrganismDisplayForm';
import { AdminConfigClient, AdminConfigError } from '../../services/adminConfigClient';
import type {
    CanonicalOrganismConfig,
    OperationRequest,
    OrganismDraftResponse,
    PublishResponse,
} from '../../types/loculusConfig';

export type EditFormKind = 'overview' | 'display' | 'metadata' | 'add-field' | 'linkouts';

interface Props {
    accessToken: string;
    backendUrl: string;
    organismKey: string;
    initialDraft: OrganismDraftResponse;
    // Latest published config, used by forms as the initial value baseline so the
    // admin sees what's live rather than the post-op draft state.
    publishedConfig?: CanonicalOrganismConfig | null;
    formKind: EditFormKind;
}

// Shared shell for every organism sub-edit page: owns the live draft, the
// postOp flow with revision-conflict refetch, and publish/discard. `formKind`
// selects which sub-form to render.
export function EditOrganismSection({
    accessToken,
    backendUrl,
    organismKey,
    initialDraft,
    publishedConfig = null,
    formKind,
}: Props) {
    const client = new AdminConfigClient(accessToken, backendUrl);
    const [draft, setDraft] = useState<OrganismDraftResponse>(initialDraft);
    const [busy, setBusy] = useState(false);
    const [publishResult, setPublishResult] = useState<PublishResponse | null>(null);
    const [discardOpen, setDiscardOpen] = useState(false);

    async function refreshDraft() {
        const fresh = await client.getOrganismDraft(organismKey);
        if (fresh !== null) setDraft(fresh);
    }

    async function postOp(op: OperationRequest): Promise<boolean> {
        setBusy(true);
        try {
            const { revision: newRevision } = await client.appendOrganismOperation(organismKey, op, draft.revision);
            setDraft({ ...draft, revision: newRevision });
            await refreshDraft();
            toast.success('Change saved to draft.');
            return true;
        } catch (e) {
            if (AdminConfigError.isInstance(e) && e.body.error === 'revision_conflict') {
                toast.warn('Someone else edited this draft — reloaded. Please redo your change.');
                await refreshDraft();
                return false;
            }
            toast.error(formatError(e));
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function publish() {
        if (draft.operations.length === 0) {
            toast.info('Nothing to publish.');
            return;
        }
        setBusy(true);
        try {
            const result = await client.publishOrganism(organismKey);
            setPublishResult(result);
        } catch (e) {
            toast.error(formatError(e));
        } finally {
            setBusy(false);
        }
    }

    async function confirmDiscard() {
        setBusy(true);
        try {
            await client.discardOrganismDraft(organismKey);
            setDiscardOpen(false);
            toast.info('Pending changes discarded.');
            await refreshDraft();
        } catch (e) {
            toast.error(formatError(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className='space-y-5'>
            <DraftStatusBanner
                draft={draft}
                organismKey={organismKey}
                busy={busy}
                showOverviewLink={formKind !== 'overview'}
                onPublish={() => void publish()}
                onDiscard={() => setDiscardOpen(true)}
            />

            {formKind === 'overview' && <OverviewBody draft={draft} />}
            {formKind === 'display' && (
                <SetOrganismDisplayForm draft={draft} busy={busy} postOp={postOp} publishedConfig={publishedConfig} />
            )}
            {formKind === 'metadata' && (
                <MetadataFieldsManager draft={draft} busy={busy} postOp={postOp} publishedConfig={publishedConfig} />
            )}
            {formKind === 'add-field' && <AddOptionalMetadataFieldForm draft={draft} busy={busy} postOp={postOp} />}
            {formKind === 'linkouts' && <LinkOutsForm draft={draft} busy={busy} postOp={postOp} />}

            {publishResult !== null && (
                <PublishModal
                    result={publishResult}
                    organismKey={organismKey}
                    onClose={() => {
                        setPublishResult(null);
                        window.location.reload();
                    }}
                />
            )}
            {discardOpen && (
                <ConfirmDialog
                    title='Discard pending changes?'
                    message={
                        <span>
                            All {draft.operations.length} pending operation{draft.operations.length === 1 ? '' : 's'}{' '}
                            for <span className='font-mono'>{organismKey}</span> will be discarded. This cannot be
                            undone.
                        </span>
                    }
                    confirmLabel='Discard'
                    destructive
                    busy={busy}
                    onConfirm={() => void confirmDiscard()}
                    onCancel={() => setDiscardOpen(false)}
                />
            )}
        </div>
    );
}

function OverviewBody({ draft }: { draft: OrganismDraftResponse }) {
    return (
        <div className='space-y-5'>
            <PendingOpsList ops={draft.operations} />
            <details className='border border-gray-200 rounded'>
                <summary className='cursor-pointer px-3 py-2 text-sm font-semibold select-none'>
                    Current draft config (read-only JSON)
                </summary>
                <div className='p-3'>
                    <JsonViewer
                        title='Draft config'
                        subtitle={`revision ${draft.revision}${draft.baseVersion !== null ? ` · based on v${draft.baseVersion}` : ''}`}
                        value={draft.config}
                    />
                </div>
            </details>
        </div>
    );
}

function formatError(e: unknown): string {
    if (AdminConfigError.isInstance(e)) {
        if (e.body.errors !== undefined) {
            return e.body.errors.map((err) => `${err.path}: ${err.message}`).join('; ');
        }
        return e.body.message ?? e.body.error;
    }
    return e instanceof Error ? e.message : String(e);
}
