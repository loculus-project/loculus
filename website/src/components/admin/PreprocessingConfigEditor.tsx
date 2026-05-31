import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';

import { ConfirmDialog } from './ConfirmDialog';
import { AdminConfigClient, AdminConfigError } from '../../services/adminConfigClient';
import { Button } from '../common/Button';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';

interface InitialConfig {
    pipelineVersion: number;
    content: string;
}

interface Props {
    accessToken: string;
    backendUrl: string;
    organismKey: string;
    /** Config files that already exist, loaded server-side. */
    initialConfigs: InitialConfig[];
}

interface Row {
    pipelineVersion: number;
    /** The text currently in the textarea. */
    content: string;
    /** The last-saved text, to compute the dirty flag. */
    savedContent: string;
    /** True once this row has been persisted at least once. */
    persisted: boolean;
}

function formatError(e: unknown): string {
    if (AdminConfigError.isInstance(e)) return e.body.message ?? e.body.error;
    return e instanceof Error ? e.message : String(e);
}

/**
 * Editor for the optional, opaque, per-(organism, pipeline version) preprocessing
 * config files. These are *not* versioned and are *not* part of the published
 * organism config — the admin edits them freely and each Save takes effect
 * immediately (direct save, no draft/publish flow). The backend stores the text
 * verbatim and never interprets it.
 */
export function PreprocessingConfigEditor({ accessToken, backendUrl, organismKey, initialConfigs }: Props) {
    const client = useMemo(() => new AdminConfigClient(accessToken, backendUrl), [accessToken, backendUrl]);

    const [rows, setRows] = useState<Row[]>(() =>
        [...initialConfigs]
            .sort((a, b) => a.pipelineVersion - b.pipelineVersion)
            .map((c) => ({
                pipelineVersion: c.pipelineVersion,
                content: c.content,
                savedContent: c.content,
                persisted: true,
            })),
    );
    const [busyVersion, setBusyVersion] = useState<number | null>(null);
    const [newVersion, setNewVersion] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

    const dirty = rows.some((r) => r.content !== r.savedContent);
    useUnsavedGuard(dirty);

    function updateRow(version: number, patch: Partial<Row>) {
        setRows((prev) => prev.map((r) => (r.pipelineVersion === version ? { ...r, ...patch } : r)));
    }

    function addVersion() {
        const parsed = Number(newVersion);
        if (!Number.isInteger(parsed) || parsed < 1) {
            toast.error('Pipeline version must be a positive integer.');
            return;
        }
        if (rows.some((r) => r.pipelineVersion === parsed)) {
            toast.error(`A config file for pipeline version ${parsed} already exists.`);
            return;
        }
        setRows((prev) =>
            [...prev, { pipelineVersion: parsed, content: '', savedContent: '', persisted: false }].sort(
                (a, b) => a.pipelineVersion - b.pipelineVersion,
            ),
        );
        setNewVersion('');
    }

    async function save(version: number) {
        const row = rows.find((r) => r.pipelineVersion === version);
        if (row === undefined) return;
        setBusyVersion(version);
        try {
            await client.setPreprocessingConfig(organismKey, version, row.content);
            updateRow(version, { savedContent: row.content, persisted: true });
            toast.success(`Saved preprocessing config for pipeline version ${version}.`);
        } catch (e) {
            toast.error(formatError(e));
        } finally {
            setBusyVersion(null);
        }
    }

    async function confirmDelete() {
        if (deleteTarget === null) return;
        const version = deleteTarget;
        setBusyVersion(version);
        try {
            const row = rows.find((r) => r.pipelineVersion === version);
            if (row?.persisted === true) {
                await client.deletePreprocessingConfig(organismKey, version);
            }
            setRows((prev) => prev.filter((r) => r.pipelineVersion !== version));
            setDeleteTarget(null);
            toast.info(`Removed preprocessing config for pipeline version ${version}.`);
        } catch (e) {
            toast.error(formatError(e));
        } finally {
            setBusyVersion(null);
        }
    }

    return (
        <div className='space-y-5'>
            <div className='text-sm text-gray-600'>
                <p>
                    Optional config files for an external preprocessing pipeline, one per pipeline version. The content
                    is opaque to Loculus — it is stored verbatim and served to the pipeline as-is. There is no
                    draft/publish step here: each <strong>Save</strong> takes effect immediately.
                </p>
                <p className='mt-1'>
                    Never put secrets (passwords, API keys) in these files — they are publicly readable.
                </p>
            </div>

            {rows.length === 0 && <p className='text-sm text-gray-500 italic'>No preprocessing config files yet.</p>}

            {rows.map((row) => {
                const rowDirty = row.content !== row.savedContent;
                const rowBusy = busyVersion === row.pipelineVersion;
                return (
                    <section key={row.pipelineVersion} className='border border-gray-200 rounded p-3 space-y-2'>
                        <div className='flex items-center justify-between'>
                            <h3 className='text-sm font-semibold'>
                                Pipeline version {row.pipelineVersion}
                                {!row.persisted && <span className='ml-2 text-xs text-amber-600'>(unsaved — new)</span>}
                                {row.persisted && rowDirty && (
                                    <span className='ml-2 text-xs text-amber-600'>(unsaved changes)</span>
                                )}
                            </h3>
                            <Button
                                type='button'
                                onClick={() => setDeleteTarget(row.pipelineVersion)}
                                disabled={rowBusy}
                                className='text-xs text-red-700 hover:text-red-800 disabled:opacity-50'
                            >
                                Remove
                            </Button>
                        </div>
                        <textarea
                            value={row.content}
                            onChange={(e) => updateRow(row.pipelineVersion, { content: e.target.value })}
                            spellCheck={false}
                            rows={14}
                            className='w-full font-mono text-xs border border-gray-300 rounded p-2'
                            aria-label={`Config file for pipeline version ${row.pipelineVersion}`}
                        />
                        <div className='flex justify-end'>
                            <Button
                                type='button'
                                onClick={() => save(row.pipelineVersion)}
                                disabled={rowBusy || !rowDirty}
                                className='bg-primary-700 hover:bg-primary-800 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50'
                            >
                                {rowBusy ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </section>
                );
            })}

            <section className='border border-dashed border-gray-300 rounded p-3'>
                <h3 className='text-sm font-semibold mb-2'>Add a pipeline version</h3>
                <div className='flex items-center gap-2'>
                    <input
                        type='number'
                        min={1}
                        step={1}
                        value={newVersion}
                        onChange={(e) => setNewVersion(e.target.value)}
                        placeholder='e.g. 1'
                        aria-label='New pipeline version'
                        className='border border-gray-300 rounded px-2 py-1 text-sm w-28'
                    />
                    <Button
                        type='button'
                        onClick={addVersion}
                        className='bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded text-sm'
                    >
                        Add
                    </Button>
                </div>
            </section>

            {deleteTarget !== null && (
                <ConfirmDialog
                    title='Remove preprocessing config?'
                    message={`Delete the config file for pipeline version ${deleteTarget}? This cannot be undone.`}
                    confirmLabel='Remove'
                    destructive
                    busy={busyVersion === deleteTarget}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
}
