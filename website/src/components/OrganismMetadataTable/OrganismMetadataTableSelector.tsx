import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { OrganismMetadataTable } from './OrganismMetadataTable.tsx';
import type { Metadata, InputField } from '../../types/config.ts';
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
    const [selectedOrganismKey, setSelectedOrganismKey] = useState<string>('');
    const selectedOrganism = organisms.find((o) => o.key === selectedOrganismKey) ?? null;

    const handleOrganismSelect = (event: { target: { value: string } }) => {
        setSelectedOrganismKey(event.target.value);
    };

    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            setSelectedOrganismKey(params.get('organism') ?? '');
        };

        handlePopState();
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (selectedOrganismKey) {
            params.set('organism', selectedOrganismKey);
        } else {
            params.delete('organism');
        }

        const newUrl =
            window.location.origin + window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }, [selectedOrganismKey]);

    return (
        <div>
            <div>
                <Select
                    id='organism-select'
                    value={selectedOrganismKey}
                    onChange={handleOrganismSelect}
                    className='border border-gray-300 p-2'
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
