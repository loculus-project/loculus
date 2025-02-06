import { useState } from 'react';
import type { FC } from 'react';

import { OrganismMetadataTable } from './OrganismMetadataTable.tsx';
import type { Metadata, InputField } from '../../types/config.ts';

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
    const [selectedOrganism, setSelectedOrganism] = useState<OrganismMetadata | null>(null);

    const handleOrganismSelect = (event: { target: { value: string } }) => {
        const organismKey = event.target.value;
        const organism = organisms.find((o) => o.key === organismKey);
        setSelectedOrganism(organism ?? null);
    };

    return (
        <div>
            <div>
                <select id='organism-select' onChange={handleOrganismSelect} className='border border-gray-300 p-2'>
                    <option value=''>-- Select an Organism --</option>
                    {organisms.map((organism) => (
                        <option key={organism.key} value={organism.key}>
                            {organism.displayName}
                        </option>
                    ))}
                </select>
            </div>

            {selectedOrganism && <OrganismMetadataTable organism={selectedOrganism} />}
        </div>
    );
};

export default OrganismMetadataTableSelector;
