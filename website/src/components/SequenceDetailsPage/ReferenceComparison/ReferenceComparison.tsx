import { useState } from 'react';

import { routes } from '../../../routes/routes';
import type { SegmentInfo } from '../../../utils/sequenceTypeHelpers';
import { Select } from '../../common/Select';

export function ReferenceComparison({
    accessionVersion,
    segments,
}: {
    accessionVersion: string;
    segments: SegmentInfo[];
}) {
    const [selected, setSelected] = useState(segments.at(0)?.name ?? '');
    const segment = segments.find(({ name }) => name === selected) ?? segments.at(0);
    if (segment === undefined) return null;
    return (
        <>
            {segments.length > 1 && (
                <Select
                    styled
                    aria-label='Genome segment'
                    value={segment.name}
                    onChange={(event) => setSelected(event.target.value)}
                >
                    {segments.map(({ name, displayName }) => (
                        <option key={name} value={name}>
                            {displayName ?? name}
                        </option>
                    ))}
                </Select>
            )}
            <iframe
                key={`${accessionVersion}:${segment.name}`}
                title={`Reference Comparison for ${accessionVersion}, ${segment.displayName ?? segment.name}`}
                src={routes.sequenceEntryReferenceComparisonPage(accessionVersion, segment.name)}
                className='mt-3 h-[650px] w-full rounded border border-gray-200 bg-white'
                allow='clipboard-write'
            />
        </>
    );
}
