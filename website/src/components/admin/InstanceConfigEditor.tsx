import { useState } from 'react';
import { toast } from 'react-toastify';

import { ConfirmDialog } from './ConfirmDialog';
import { PublishModal } from './PublishModal';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { AdminConfigClient, AdminConfigError, canonicalInstanceConfig } from '../../services/adminConfigClient';
import type { CanonicalInstanceConfig, InstanceDraftResponse, PublishResponse } from '../../types/loculusConfig';
import { Button } from '../common/Button';

interface Props {
    accessToken: string;
    backendUrl: string;
    initialDraft: InstanceDraftResponse | null;
    publishedConfig: CanonicalInstanceConfig;
}

const fileUrlTypes = ['website', 'backend', 's3'] as const;

export function InstanceConfigEditor({ accessToken, backendUrl, initialDraft, publishedConfig }: Props) {
    const client = new AdminConfigClient(accessToken, backendUrl);
    const baseConfig: CanonicalInstanceConfig = initialDraft?.config ?? publishedConfig;

    const [config, setConfig] = useState<CanonicalInstanceConfig>(baseConfig);
    const [revision, setRevision] = useState<number | undefined>(initialDraft?.revision);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [publishResult, setPublishResult] = useState<PublishResponse | null>(null);
    const [discardOpen, setDiscardOpen] = useState(false);
    useUnsavedGuard(dirty);

    // Raw JSON escape hatch (advanced). Seeded explicitly from the live form via
    // the "Load form values" button so the two views never drift silently.
    const [rawText, setRawText] = useState(() => JSON.stringify(baseConfig, null, 2));
    const [rawError, setRawError] = useState<string | null>(null);

    function patch(p: Partial<CanonicalInstanceConfig>) {
        setConfig((c) => ({ ...c, ...p }));
        setDirty(true);
    }

    // Maps '' → null so cleared optional fields are dropped rather than stored as "".
    function patchText(key: keyof CanonicalInstanceConfig, value: string) {
        patch({ [key]: value === '' ? null : value } as Partial<CanonicalInstanceConfig>);
    }

    function setLogoUrl(value: string) {
        patch({ logo: value === '' ? null : { ...(config.logo ?? {}), url: value } });
    }

    function setSupport(field: 'email' | 'url', value: string) {
        const next = { ...(config.supportContact ?? {}), [field]: value === '' ? null : value };
        const empty = (next.email ?? null) === null && (next.url ?? null) === null;
        patch({ supportContact: empty ? null : next });
    }

    async function save(): Promise<boolean> {
        const result = canonicalInstanceConfig.safeParse(config);
        if (!result.success) {
            toast.error(
                `Schema error: ${result.error.issues
                    .slice(0, 5)
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; ')}`,
            );
            return false;
        }
        setBusy(true);
        try {
            const { revision: newRevision } = await client.putInstanceDraft(result.data, revision);
            setRevision(newRevision);
            setDirty(false);
            toast.success('Instance draft saved.');
            return true;
        } catch (e) {
            toast.error(formatError(e));
            return false;
        } finally {
            setBusy(false);
        }
    }

    function applyRawToForm() {
        setRawError(null);
        let parsed: unknown;
        try {
            parsed = JSON.parse(rawText);
        } catch (e) {
            setRawError(`JSON parse error: ${(e as Error).message}`);
            return;
        }
        const result = canonicalInstanceConfig.safeParse(parsed);
        if (!result.success) {
            setRawError(
                `Schema error: ${result.error.issues
                    .slice(0, 5)
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; ')}`,
            );
            return;
        }
        setConfig(result.data);
        setDirty(true);
        toast.info('JSON applied to the form. Review, then Save draft.');
    }

    async function publish() {
        setBusy(true);
        try {
            const result = await client.publishInstance();
            setPublishResult(result);
        } catch (e) {
            toast.error(formatError(e));
        } finally {
            setBusy(false);
        }
    }

    async function discardConfirmed() {
        setBusy(true);
        try {
            await client.discardInstanceDraft();
            setDiscardOpen(false);
            window.location.reload();
        } catch (e) {
            toast.error(formatError(e));
            setBusy(false);
        }
    }

    return (
        <div className='space-y-6'>
            <header className='flex items-baseline gap-4'>
                <h2 className='text-lg font-semibold'>{config.name}</h2>
                <span className='text-sm text-gray-500'>
                    {revision !== undefined ? `draft revision ${revision}` : 'no draft yet'}
                    {dirty && <span className='text-amber-600'> · unsaved changes</span>}
                </span>
            </header>

            <Section title='Branding'>
                <TextField label='Name' value={config.name} onChange={(v) => patch({ name: v })} />
                <TextArea
                    label='Description'
                    value={config.description ?? ''}
                    onChange={(v) => patchText('description', v)}
                />
                <TextField label='Logo URL' mono value={config.logo?.url ?? ''} onChange={setLogoUrl} />
            </Section>

            <Section title='Banners'>
                <TextArea
                    label='Banner message'
                    value={config.bannerMessage ?? ''}
                    onChange={(v) => patchText('bannerMessage', v)}
                />
                <TextField
                    label='Banner message URL'
                    mono
                    value={config.bannerMessageURL ?? ''}
                    onChange={(v) => patchText('bannerMessageURL', v)}
                />
                <TextArea
                    label='Submission banner message'
                    value={config.submissionBannerMessage ?? ''}
                    onChange={(v) => patchText('submissionBannerMessage', v)}
                />
                <TextField
                    label='Submission banner URL'
                    mono
                    value={config.submissionBannerMessageURL ?? ''}
                    onChange={(v) => patchText('submissionBannerMessageURL', v)}
                />
            </Section>

            <Section title='Support & links'>
                <TextField
                    label='Support contact email'
                    value={config.supportContact?.email ?? ''}
                    onChange={(v) => setSupport('email', v)}
                />
                <TextField
                    label='Support contact URL'
                    mono
                    value={config.supportContact?.url ?? ''}
                    onChange={(v) => setSupport('url', v)}
                />
                <TextField
                    label='GitHub main URL'
                    mono
                    value={config.gitHubMainUrl ?? ''}
                    onChange={(v) => patchText('gitHubMainUrl', v)}
                />
                <TextField
                    label='GitHub issues URL'
                    mono
                    value={config.gitHubIssuesUrl ?? ''}
                    onChange={(v) => patchText('gitHubIssuesUrl', v)}
                />
                <TextField
                    label='GitHub edit link'
                    mono
                    value={config.gitHubEditLink ?? ''}
                    onChange={(v) => patchText('gitHubEditLink', v)}
                />
                <TextField
                    label='Issues email'
                    value={config.issuesEmail ?? ''}
                    onChange={(v) => patchText('issuesEmail', v)}
                />
            </Section>

            <Section title='Feature toggles'>
                <Toggle
                    label='Enable SeqSets'
                    checked={config.enableSeqSets}
                    onChange={(v) => patch({ enableSeqSets: v })}
                />
                <Toggle
                    label='Enable login navigation item'
                    checked={config.enableLoginNavigationItem}
                    onChange={(v) => patch({ enableLoginNavigationItem: v })}
                />
                <Toggle
                    label='Enable submission navigation item'
                    checked={config.enableSubmissionNavigationItem}
                    onChange={(v) => patch({ enableSubmissionNavigationItem: v })}
                />
                <Toggle
                    label='Enable submission pages'
                    checked={config.enableSubmissionPages}
                    onChange={(v) => patch({ enableSubmissionPages: v })}
                />
                <Toggle
                    label='Data use terms enabled'
                    checked={config.dataUseTerms.enabled}
                    onChange={(v) => patch({ dataUseTerms: { ...config.dataUseTerms, enabled: v } })}
                />
            </Section>

            <Section title='Display defaults'>
                <TextField
                    label='Date field for group graph'
                    mono
                    value={config.dateFieldForGroupGraph ?? ''}
                    onChange={(v) => patchText('dateFieldForGroupGraph', v)}
                />
                <label className='block text-sm'>
                    <span className='text-gray-600'>Output file URL type</span>
                    <select
                        value={config.fileSharing.outputFileUrlType}
                        onChange={(e) =>
                            patch({
                                fileSharing: {
                                    ...config.fileSharing,
                                    outputFileUrlType: e.target.value as (typeof fileUrlTypes)[number],
                                },
                            })
                        }
                        className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm'
                    >
                        {fileUrlTypes.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </label>
            </Section>

            <details className='border border-gray-200 rounded'>
                <summary className='cursor-pointer px-3 py-2 text-sm font-semibold select-none'>
                    Advanced — full config as raw JSON
                </summary>
                <div className='p-3 space-y-2'>
                    <p className='text-xs text-gray-600'>
                        Escape hatch for fields not covered by the forms above (welcome message HTML, additional head
                        HTML, SeqSets graphs, sequence flagging, lineage definitions, etc.). Click{' '}
                        <em>Load form values</em> to refresh this from the form, edit, then <em>Apply to form</em> and{' '}
                        <em>Save draft</em>.
                    </p>
                    <div className='flex gap-2'>
                        <Button
                            type='button'
                            onClick={() => {
                                setRawText(JSON.stringify(config, null, 2));
                                setRawError(null);
                            }}
                            className='bg-white border border-gray-300 hover:bg-gray-50 px-2 py-1 rounded text-xs'
                        >
                            Load form values
                        </Button>
                        <Button
                            type='button'
                            disabled={busy}
                            onClick={applyRawToForm}
                            className='bg-white border border-gray-300 hover:bg-gray-50 px-2 py-1 rounded text-xs'
                        >
                            Apply to form
                        </Button>
                    </div>
                    <textarea
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        className='font-mono text-xs w-full h-[40vh] border border-gray-300 rounded p-2'
                        spellCheck={false}
                    />
                    {rawError !== null && <p className='text-xs text-red-600 whitespace-pre-wrap'>{rawError}</p>}
                </div>
            </details>

            <div className='flex items-center gap-3 border-t border-gray-200 pt-4'>
                <Button
                    type='button'
                    disabled={busy || !dirty}
                    onClick={() => void save()}
                    className='bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded text-sm'
                >
                    Save draft
                </Button>
                <Button
                    type='button'
                    disabled={busy || dirty || revision === undefined}
                    onClick={() => void publish()}
                    className='bg-primary-700 hover:bg-primary-800 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50'
                >
                    Publish
                </Button>
                {dirty && <span className='text-xs text-amber-600'>Save the draft before publishing.</span>}
                {revision !== undefined && !dirty && (
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
                    onClose={() => {
                        setPublishResult(null);
                        window.location.reload();
                    }}
                />
            )}
            {discardOpen && (
                <ConfirmDialog
                    title='Discard instance draft?'
                    message='All unpublished changes to the instance config will be lost. This cannot be undone.'
                    confirmLabel='Discard'
                    destructive
                    busy={busy}
                    onConfirm={() => void discardConfirmed()}
                    onCancel={() => setDiscardOpen(false)}
                />
            )}
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className='border border-gray-200 rounded p-3 space-y-2 max-w-2xl'>
            <h3 className='text-sm font-semibold'>{title}</h3>
            {children}
        </section>
    );
}

function TextField({
    label,
    value,
    onChange,
    mono = false,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    mono?: boolean;
}) {
    return (
        <label className='block text-sm'>
            <span className='text-gray-600'>{label}</span>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm${mono ? ' font-mono' : ''}`}
            />
        </label>
    );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <label className='block text-sm'>
            <span className='text-gray-600'>{label}</span>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={2}
                className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm'
            />
        </label>
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className='flex items-center gap-2 text-sm'>
            <input type='checkbox' checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className='text-gray-700'>{label}</span>
        </label>
    );
}

function formatError(e: unknown): string {
    if (AdminConfigError.isInstance(e)) {
        if (e.body.error === 'revision_conflict') {
            return 'Revision conflict — please reload.';
        }
        if (e.body.errors !== undefined) {
            return e.body.errors.map((err) => `${err.path}: ${err.message}`).join('; ');
        }
        return e.body.message ?? e.body.error;
    }
    return e instanceof Error ? e.message : String(e);
}
