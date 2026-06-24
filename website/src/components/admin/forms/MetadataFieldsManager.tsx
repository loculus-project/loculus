import { useEffect, useState } from 'react';

import type { OrganismFormProps } from './types';
import type { CanonicalOrganismConfig } from '../../../types/loculusConfig';
import { Button } from '../../common/Button';

type FieldEntry = CanonicalOrganismConfig['schema']['metadata'][number];

interface Props extends OrganismFormProps {
    publishedConfig?: CanonicalOrganismConfig | null;
}

// Reorder + per-row display editing in one table. Reordering is local until
// "Apply order" POSTs reorderMetadataFields; each row's edits are local until
// its Save POSTs setMetadataFieldDisplay with only the changed keys.
export function MetadataFieldsManager({ draft, busy, postOp, publishedConfig }: Props) {
    const fields = draft.config.schema.metadata;
    const publishedByName = new Map((publishedConfig?.schema.metadata ?? []).map((f) => [f.name, f] as const));

    const [order, setOrder] = useState<string[]>(() => fields.map((f) => f.name));
    const fieldsKey = fields.map((f) => f.name).join('␟');
    useEffect(() => {
        setOrder(fields.map((f) => f.name));
    }, [fieldsKey]);

    const move = (idx: number, delta: number) => {
        const next = idx + delta;
        if (next < 0 || next >= order.length) return;
        const copy = [...order];
        [copy[idx], copy[next]] = [copy[next], copy[idx]];
        setOrder(copy);
    };

    const byName = new Map(fields.map((f) => [f.name, f]));
    const orderDirty = order.length !== fields.length || order.some((n, i) => fields[i].name !== n);

    if (fields.length === 0) {
        return (
            <p className='text-sm italic text-gray-500'>
                No metadata fields yet — add the first one in <em>Add field</em>.
            </p>
        );
    }

    return (
        <section className='space-y-3'>
            <p className='text-sm text-gray-600'>
                Reorder fields with the arrows and click <em>Apply order</em>. Edit a row's display attributes and click{' '}
                <em>Save</em> to apply that row.
            </p>
            <div className='overflow-x-auto border border-gray-200 rounded'>
                <table className='w-full text-sm border-collapse'>
                    <thead>
                        <tr className='border-b border-gray-200 text-left text-xs text-gray-500 bg-gray-50'>
                            <th className='py-1 px-2 font-medium w-12'>Order</th>
                            <th className='py-1 px-2 font-medium'>Field</th>
                            <th className='py-1 px-2 font-medium'>Type</th>
                            <th className='py-1 px-2 font-medium'>Display name</th>
                            <th className='py-1 px-2 font-medium'>Header</th>
                            <th className='py-1 px-2 font-medium'>Description</th>
                            <th className='py-1 px-2 font-medium text-center'>Hidden</th>
                            <th className='py-1 px-2' />
                        </tr>
                    </thead>
                    <tbody>
                        {order.map((name, idx) => {
                            const field = byName.get(name);
                            if (field === undefined) return null;
                            return (
                                <MetadataFieldRow
                                    key={name}
                                    field={field}
                                    publishedField={publishedByName.get(name) ?? null}
                                    index={idx}
                                    canMoveUp={idx > 0}
                                    canMoveDown={idx < order.length - 1}
                                    onMoveUp={() => move(idx, -1)}
                                    onMoveDown={() => move(idx, 1)}
                                    busy={busy}
                                    postOp={postOp}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className='flex items-center gap-3'>
                <Button
                    type='button'
                    disabled={busy || !orderDirty}
                    onClick={() => void postOp({ type: 'reorderMetadataFields', payload: { order } })}
                    className='bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 px-3 py-1 rounded text-sm'
                >
                    Apply order
                </Button>
                {orderDirty ? (
                    <span className='text-xs text-amber-600'>Order changed — apply to save.</span>
                ) : (
                    <span className='text-xs text-gray-500'>Order matches current draft.</span>
                )}
            </div>
        </section>
    );
}

interface RowProps {
    field: FieldEntry;
    publishedField: FieldEntry | null;
    index: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    busy: boolean;
    postOp: OrganismFormProps['postOp'];
}

function MetadataFieldRow({
    field,
    publishedField,
    index,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    busy,
    postOp,
}: RowProps) {
    // Seed inputs from the published row when available so the admin sees live
    // values; fields that exist only in the draft fall back to the draft row.
    const baseline = publishedField ?? field;
    const initialDisplayName = baseline.displayName ?? '';
    const initialHeader = baseline.header ?? '';
    const initialDescription = baseline.description ?? '';
    const initialHidden = baseline.hidden ?? false;

    // A pending op already changed this field in the draft; flag it so the admin
    // does not overwrite that edit unwittingly.
    const draftDiffers =
        publishedField !== null &&
        ((field.displayName ?? '') !== initialDisplayName ||
            (field.header ?? '') !== initialHeader ||
            (field.description ?? '') !== initialDescription ||
            (field.hidden ?? false) !== initialHidden);

    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [header, setHeader] = useState(initialHeader);
    const [description, setDescription] = useState(initialDescription);
    const [hidden, setHidden] = useState(initialHidden);

    useEffect(() => {
        setDisplayName(initialDisplayName);
        setHeader(initialHeader);
        setDescription(initialDescription);
        setHidden(initialHidden);
    }, [initialDisplayName, initialHeader, initialDescription, initialHidden]);

    const dirty =
        displayName !== initialDisplayName ||
        header !== initialHeader ||
        description !== initialDescription ||
        hidden !== initialHidden;

    const cell = 'w-full border border-gray-300 rounded px-1.5 py-0.5 text-sm';

    return (
        <tr className='border-b border-gray-100 align-top'>
            <td className='py-1 px-2 whitespace-nowrap'>
                <div className='flex items-center gap-1'>
                    <span className='text-gray-400 text-xs w-4 text-right'>{index + 1}</span>
                    <Button
                        type='button'
                        onClick={onMoveUp}
                        disabled={busy || !canMoveUp}
                        className='text-xs text-gray-700 px-1 hover:bg-gray-100 rounded disabled:opacity-30'
                        aria-label={`Move ${field.name} up`}
                    >
                        ↑
                    </Button>
                    <Button
                        type='button'
                        onClick={onMoveDown}
                        disabled={busy || !canMoveDown}
                        className='text-xs text-gray-700 px-1 hover:bg-gray-100 rounded disabled:opacity-30'
                        aria-label={`Move ${field.name} down`}
                    >
                        ↓
                    </Button>
                </div>
            </td>
            <td className='py-1 px-2 font-mono text-xs whitespace-nowrap'>
                {field.name}
                {draftDiffers && (
                    <span
                        title={`Pending in draft — displayName: ${field.displayName ?? ''} · header: ${field.header ?? ''} · description: ${field.description ?? ''} · hidden: ${String(field.hidden ?? false)}`}
                        aria-label='Pending change in draft'
                        className='ml-1 text-amber-600 cursor-help'
                    >
                        ⚠
                    </span>
                )}
            </td>
            <td className='py-1 px-2 text-xs text-gray-500 whitespace-nowrap'>{field.type}</td>
            <td className='py-1 px-2'>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={cell} />
            </td>
            <td className='py-1 px-2'>
                <input value={header} onChange={(e) => setHeader(e.target.value)} className={cell} />
            </td>
            <td className='py-1 px-2'>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={cell} />
            </td>
            <td className='py-1 px-2 text-center'>
                <input type='checkbox' checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            </td>
            <td className='py-1 px-2'>
                <Button
                    type='button'
                    disabled={busy || !dirty}
                    onClick={() => {
                        const payload: Record<string, unknown> = { field: field.name };
                        if (displayName !== initialDisplayName) payload.displayName = displayName;
                        if (header !== initialHeader) payload.header = header;
                        if (description !== initialDescription) payload.description = description;
                        if (hidden !== initialHidden) payload.hidden = hidden;
                        void postOp({ type: 'setMetadataFieldDisplay', payload });
                    }}
                    className='bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 px-2 py-0.5 rounded text-xs'
                >
                    Save
                </Button>
            </td>
        </tr>
    );
}
