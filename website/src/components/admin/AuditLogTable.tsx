import { useMemo, useState } from 'react';

import type { AuditEntry } from '../../types/loculusConfig';

interface Props {
    entries: AuditEntry[];
    /** Organism keys to populate the filter dropdown's "specific organism" options. */
    organismKeys: string[];
}

type Filter = { kind: 'all' } | { kind: 'instance' } | { kind: 'organism'; key: string };

function parseFilter(raw: string): Filter {
    if (raw === 'instance') return { kind: 'instance' };
    if (raw === 'all') return { kind: 'all' };
    return { kind: 'organism', key: raw };
}

function serializeFilter(f: Filter): string {
    return f.kind === 'organism' ? f.key : f.kind;
}

export function AuditLogTable({ entries, organismKeys }: Props) {
    const [filter, setFilter] = useState<Filter>({ kind: 'all' });

    const filtered = useMemo(() => {
        switch (filter.kind) {
            case 'all':
                return entries;
            case 'instance':
                return entries.filter((e) => e.scope === 'instance');
            case 'organism':
                return entries.filter((e) => e.scope === 'organism' && e.organismKey === filter.key);
        }
    }, [entries, filter]);

    // Organism keys mentioned in the entries but not in the known-organisms list
    // (e.g. after a backend rename, or for an org that's been removed). Include
    // them so the admin can still filter to them.
    const allOrganismKeys = useMemo(() => {
        const set = new Set(organismKeys);
        for (const e of entries) {
            if (e.scope === 'organism' && e.organismKey !== null) set.add(e.organismKey);
        }
        return [...set].sort();
    }, [organismKeys, entries]);

    const counts = useMemo(
        () => ({
            total: entries.length,
            instance: entries.filter((e) => e.scope === 'instance').length,
            organism: entries.filter((e) => e.scope === 'organism').length,
        }),
        [entries],
    );

    return (
        <div className='space-y-3'>
            <div className='flex flex-wrap items-center gap-3'>
                <label className='text-sm flex items-center gap-2'>
                    <span className='text-gray-600'>Filter:</span>
                    <select
                        value={serializeFilter(filter)}
                        onChange={(e) => setFilter(parseFilter(e.target.value))}
                        className='border border-gray-300 rounded px-2 py-1 text-sm'
                    >
                        <option value='all'>All entries ({counts.total})</option>
                        <option value='instance'>Instance only ({counts.instance})</option>
                        {allOrganismKeys.length > 0 && (
                            <optgroup label={`Organisms (${counts.organism})`}>
                                {allOrganismKeys.map((k) => (
                                    <option key={k} value={k}>
                                        {k}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </label>
                <span className='text-xs text-gray-500'>
                    Showing {filtered.length} of {entries.length} entries
                </span>
            </div>

            <table className='w-full text-sm border-collapse'>
                <thead>
                    <tr className='border-b border-gray-200 text-left'>
                        <th className='py-1.5 pr-4 font-semibold'>When</th>
                        <th className='py-1.5 pr-4 font-semibold'>Actor</th>
                        <th className='py-1.5 pr-4 font-semibold'>Scope</th>
                        <th className='py-1.5 pr-4 font-semibold'>Organism</th>
                        <th className='py-1.5 pr-4 font-semibold'>Action</th>
                        <th className='py-1.5 pr-4 font-semibold'>Result version</th>
                        <th className='py-1.5 pr-4 font-semibold'>Summary</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map((e) => (
                        <tr key={e.id} className='border-b border-gray-100 align-top'>
                            <td className='py-1.5 pr-4 font-mono text-xs whitespace-nowrap'>{e.occurredAt}</td>
                            <td className='py-1.5 pr-4'>{e.actor}</td>
                            <td className='py-1.5 pr-4'>
                                <span
                                    className={`inline-block rounded px-2 py-0.5 text-xs ${
                                        e.scope === 'instance'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-purple-100 text-purple-800'
                                    }`}
                                >
                                    {e.scope}
                                </span>
                            </td>
                            <td className='py-1.5 pr-4 font-mono text-xs'>{e.organismKey ?? ''}</td>
                            <td className='py-1.5 pr-4 font-mono text-xs'>{e.action}</td>
                            <td className='py-1.5 pr-4 text-xs'>
                                {e.resultVersion !== null ? `v${e.resultVersion}` : ''}
                            </td>
                            <td className='py-1.5 pr-4 text-xs'>
                                {typeof e.details?.summary === 'string' ? e.details.summary : ''}
                            </td>
                        </tr>
                    ))}
                    {filtered.length === 0 && (
                        <tr>
                            <td className='py-3 italic text-gray-500' colSpan={7}>
                                No audit entries match this filter.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
