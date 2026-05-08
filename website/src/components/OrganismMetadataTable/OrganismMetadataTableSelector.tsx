import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { OrganismMetadataTable, TableQueryParams } from './OrganismMetadataTable.tsx';
import type { Metadata, InputField } from '../../types/config.ts';
import { getUrl } from '../../utils/getUrl.ts';
import { Select } from '../common/Select.tsx';

export type OrganismMetadata = {
    key: string;
    displayName: string;
    metadata: Metadata[];
    groupedInputFields: Map<string, InputField[]>;
};

const OrganismMetadataTableSelector: FC<{
    organisms: OrganismMetadata[];
}> = ({ organisms }) => {
    const [selectedOrganismKey, setSelectedOrganismKey] = useState<string>('');

    // Set the initial selected organism based on the URL parameter
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setSelectedOrganismKey(params.get(TableQueryParams.ORGANISM) ?? '');
    }, []);

    const selectedOrganism = organisms.find((o) => o.key === selectedOrganismKey) ?? null;

    const handleOrganismSelect = (organism: string) => {
        setSelectedOrganismKey(organism);
        const params = new URLSearchParams(window.location.search);
        if (organism) {
            params.set(TableQueryParams.ORGANISM, organism);
        } else {
            // Clear all table query parameters
            Object.values(TableQueryParams).forEach((param) => params.delete(param));
        }
        const newUrl = getUrl(window.location.origin, window.location.pathname, params);
        window.history.replaceState({ path: newUrl }, '', newUrl);
    };

    return (
        <div>
            <div>
                <Select
                    id='organism-select'
                    value={selectedOrganismKey}
                    onChange={(e) => handleOrganismSelect(e.target.value)}
                    className='border border-gray-300 p-2 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-600 focus:border-primary-600'
                >
                    <option value=''>-- Select an Organism --</option>
                    {organisms.map((organism) => (
                        <option key={organism.key} value={organism.key}>
                            {organism.displayName}
                        </option>
                    ))}
                </Select>
            </div>

            {selectedOrganism && <OrganismMetadataTable organism={selectedOrganism} />}
        </div>
    );
};

export default OrganismMetadataTableSelector;
