import { useState } from 'react';

import type { OrganismFormProps } from './types';
import { Button } from '../../common/Button';

const metadataTypes = ['string', 'int', 'float', 'number', 'date', 'timestamp', 'boolean', 'authors'] as const;
type MetadataType = (typeof metadataTypes)[number];

export function AddOptionalMetadataFieldForm({ draft, busy, postOp }: OrganismFormProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState<MetadataType>('string');
    const [displayName, setDisplayName] = useState('');

    const reset = () => {
        setName('');
        setDisplayName('');
        setType('string');
    };

    const existing = draft.config.schema.metadata.map((m) => m.name);
    const collision = name !== '' && existing.includes(name);

    return (
        <section className='border border-gray-200 rounded p-4 space-y-3 max-w-xl'>
            <p className='text-sm text-gray-600'>
                Add a new optional metadata field. The field becomes available for submitters and for display once you
                publish.
            </p>
            <label className='block text-sm'>
                <span className='text-gray-600'>Field name</span>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder='e.g. host'
                    className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono'
                />
                {collision && <span className='text-xs text-red-600'>A field with this name already exists.</span>}
            </label>
            <label className='block text-sm'>
                <span className='text-gray-600'>Type</span>
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value as MetadataType)}
                    className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm'
                >
                    {metadataTypes.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </label>
            <label className='block text-sm'>
                <span className='text-gray-600'>Display name (optional)</span>
                <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder='e.g. Host species'
                    className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm'
                />
            </label>
            <Button
                type='button'
                disabled={busy || name === '' || collision}
                onClick={() => {
                    const payload: Record<string, unknown> = { name, type };
                    if (displayName !== '') payload.displayName = displayName;
                    void postOp({ type: 'addOptionalMetadataField', payload }).then((ok) => {
                        if (ok) reset();
                    });
                }}
                className='bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 px-3 py-1 rounded text-sm'
            >
                Add field
            </Button>
            {existing.length > 0 && (
                <p className='text-xs text-gray-500'>
                    Existing fields: <span className='font-mono'>{existing.join(', ')}</span>
                </p>
            )}
        </section>
    );
}
