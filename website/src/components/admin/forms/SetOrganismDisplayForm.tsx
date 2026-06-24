import { useState } from 'react';

import type { OrganismFormProps } from './types';
import type { CanonicalOrganismConfig } from '../../../types/loculusConfig';
import { Button } from '../../common/Button';

interface Props extends OrganismFormProps {
    // Latest published config, used as the input baseline so the admin sees live
    // values rather than the post-op draft state.
    publishedConfig?: CanonicalOrganismConfig | null;
}

export function SetOrganismDisplayForm({ draft, busy, postOp, publishedConfig }: Props) {
    const baseline = publishedConfig ?? draft.config;
    // Mirror configTransform.ts: fall back to the legacy schema.organismName when
    // displayName is unset, so admins see the same name visitors do.
    const initialDisplayName = baseline.displayName ?? baseline.schema.organismName;
    const initialDescription = baseline.description ?? '';
    const initialImageUrl = baseline.image?.url ?? '';

    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [description, setDescription] = useState(initialDescription);
    const [imageUrl, setImageUrl] = useState(initialImageUrl);

    const dirty =
        displayName !== initialDisplayName || description !== initialDescription || imageUrl !== initialImageUrl;

    // Flag fields a pending op already changed in the draft, so the admin does
    // not overwrite them unwittingly.
    const draftValues = draft.config;
    const draftDiffersDisplayName = (draftValues.displayName ?? '') !== initialDisplayName;
    const draftDiffersDescription = (draftValues.description ?? '') !== initialDescription;
    const draftDiffersImageUrl = (draftValues.image?.url ?? '') !== initialImageUrl;

    return (
        <section className='border border-gray-200 rounded p-4 space-y-3 max-w-xl'>
            <p className='text-sm text-gray-600'>
                Update the public-facing display fields. The values shown below are the currently{' '}
                <strong>published</strong> values; type over them to draft a change.
            </p>
            <Field
                label='Display name'
                value={displayName}
                onChange={setDisplayName}
                placeholder='e.g. Lassa virus'
                pendingHint={
                    draftDiffersDisplayName ? `Pending in draft: "${draftValues.displayName ?? ''}"` : undefined
                }
            />
            <FieldArea
                label='Description'
                value={description}
                onChange={setDescription}
                pendingHint={
                    draftDiffersDescription
                        ? `Pending in draft (${(draftValues.description ?? '').length} chars)`
                        : undefined
                }
            />
            <Field
                label='Image URL'
                value={imageUrl}
                onChange={setImageUrl}
                mono
                pendingHint={
                    draftDiffersImageUrl ? `Pending in draft: ${draftValues.image?.url ?? '(cleared)'}` : undefined
                }
            />
            <div className='flex items-center gap-3 pt-1'>
                <Button
                    type='button'
                    disabled={busy || !dirty}
                    onClick={() => {
                        const payload: Record<string, unknown> = {};
                        if (displayName !== initialDisplayName) payload.displayName = displayName;
                        if (description !== initialDescription) payload.description = description;
                        if (imageUrl !== initialImageUrl) payload.image = imageUrl === '' ? null : { url: imageUrl };
                        if (Object.keys(payload).length === 0) return;
                        void postOp({ type: 'setOrganismDisplay', payload });
                    }}
                    className='bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 px-3 py-1 rounded text-sm'
                >
                    Save changes
                </Button>
                {!dirty && <span className='text-xs text-gray-500'>No changes yet.</span>}
            </div>
        </section>
    );
}

interface FieldBaseProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    pendingHint?: string;
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    pendingHint,
    mono = false,
}: FieldBaseProps & { mono?: boolean }) {
    return (
        <label className='block text-sm'>
            <span className='text-gray-600'>{label}</span>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm${mono ? ' font-mono' : ''}`}
            />
            {pendingHint !== undefined && <span className='text-xs text-amber-600 block mt-0.5'>{pendingHint}</span>}
        </label>
    );
}

function FieldArea({ label, value, onChange, pendingHint }: FieldBaseProps) {
    return (
        <label className='block text-sm'>
            <span className='text-gray-600'>{label}</span>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={3}
                className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm'
            />
            {pendingHint !== undefined && <span className='text-xs text-amber-600 block mt-0.5'>{pendingHint}</span>}
        </label>
    );
}
