import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { OrganismMetadataTable } from './OrganismMetadataTable.tsx';
import type { Metadata, InputField } from '../../types/config.ts';
import { getUrl } from '../../utils/getUrl.ts';
import { Select } from '../common/Select.tsx';

export type OrganismMetadata = {
    key: string;
    displayName: string;
    metadata: Metadata[];
    groupedInputFields: Map<string, InputField[]>;
};

type Props = {
    organisms: OrganismMetadata[];
};

const OrganismMetadataTableSelector: FC<Props> = ({ organisms }) => {
    const [selectedOrganismKey, setSelectedOrganismKey] = useState('');
    const [showDisplayNames, setShowDisplayNames] = useState(false);

    useEffect(() => {
        setSelectedOrganismKey(new URLSearchParams(window.location.search).get('organism') ?? '');
    }, []);

    const selectedOrganism = organisms.find((o) => o.key === selectedOrganismKey) ?? null;

    const handleOrganismSelect = (organism: string) => {
        setSelectedOrganismKey(organism);
        const params = new URLSearchParams(window.location.search);
        if (organism) {
            params.set('organism', organism);
        } else {
            params.delete('organism');
            params.delete('fieldType');
        }
        const newUrl = getUrl(window.location.origin, window.location.pathname, params);
        window.history.replaceState({ path: newUrl }, '', newUrl);
    };

    return (
        <div>
            <div className='flex flex-wrap items-center gap-4'>
                <Select
                    id='organism-select'
                    value={selectedOrganismKey}
                    onChange={(e) => handleOrganismSelect(e.target.value)}
                    className='border border-gray-300 p-2'
                >
                    <option value=''>-- Select an Organism --</option>
                    {organisms.map((organism) => (
                        <option key={organism.key} value={organism.key}>
                            {organism.displayName}
                        </option>
                    ))}
                </Select>
                {selectedOrganism && (
                    <label className='flex items-center gap-2 text-sm cursor-pointer'>
                        <input
                            type='checkbox'
                            className='h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600 cursor-pointer'
                            checked={showDisplayNames}
                            onChange={(e) => setShowDisplayNames(e.target.checked)}
                        />
                        <span>Show display names</span>
                    </label>
                )}
            </div>

            {selectedOrganism && (
                <OrganismMetadataTable organism={selectedOrganism} showDisplayNames={showDisplayNames} />
            )}
        </div>
    );
};

export default OrganismMetadataTableSelector;
