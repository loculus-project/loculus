import { useId, useState } from 'react';

import { routes } from '../../../routes/routes';
import type { SegmentInfo } from '../../../utils/sequenceTypeHelpers';
import { Button } from '../../common/Button';
import { Select } from '../../common/Select';

export function GenomePreviewToggle({
    accessionVersion,
    segments,
}: {
    accessionVersion: string;
    segments: SegmentInfo[];
}) {
    const [visible, setVisible] = useState(false);
    const [selected, setSelected] = useState(segments.at(0)?.name ?? '');
    const id = useId();
    const segment = segments.find(({ name }) => name === selected) ?? segments.at(0);
    if (segment === undefined) return null;

    return (
        <section className='my-4' aria-label='Genome viewer'>
            <div className='flex items-center gap-3'>
                <Button
                    size='sm'
                    variant='outline-neutral'
                    aria-pressed={visible}
                    aria-controls={id}
                    onClick={() => setVisible(!visible)}
                >
                    Genome viewer
                </Button>
                {visible && segments.length > 1 && (
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
            </div>
            {visible && (
                <iframe
                    key={`${accessionVersion}:${segment.name}`}
                    id={id}
                    title={`Genome viewer for ${accessionVersion}, ${segment.displayName ?? segment.name}`}
                    src={routes.sequenceEntryGenomePreviewPage(accessionVersion, segment.name)}
                    className='mt-3 h-[650px] w-full rounded border border-gray-200 bg-white'
                    allow='clipboard-write'
                />
            )}
        </section>
    );
}
