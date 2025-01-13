import React, { useState, useEffect } from 'react';
import type { FC } from 'react';

import { routes } from '../routes/routes.ts';
import type { Metadata, InputField } from '../types/config';
import { groupFieldsByHeader } from '../utils/groupFieldsByHeader';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

export type OrganismMetadata = {
    key: string;
    displayName: string;
    metadata: Metadata[];
    inputFields: InputField[];
};

type Props = {
    organisms: OrganismMetadata[];
};

const OrganismTableSelector: FC<Props> = ({ organisms }) => {
    const [selectedOrganism, setSelectedOrganism] = useState<OrganismMetadata | null>(null);
    const [groupedFields, setGroupedFields] = useState<Map<string, InputField[]>>(new Map());
    const [expandedHeaders, setExpandedHeaders] = useState<Set<string>>(new Set(['Required fields', 'Desired fields']));

    const handleOrganismSelect = (event: { target: { value: string } }) => {
        const organismKey = event.target.value;
        const organism = organisms.find((o) => o.key === organismKey);
        setSelectedOrganism(organism ?? null);
    };

    const toggleHeader = (header: string) => {
        const updatedExpandedHeaders = new Set(expandedHeaders);
        if (updatedExpandedHeaders.has(header)) {
            updatedExpandedHeaders.delete(header); // Close the table if already expanded
        } else {
            updatedExpandedHeaders.add(header);
        }
        setExpandedHeaders(updatedExpandedHeaders);
    };

    useEffect(() => {
        if (selectedOrganism) {
            setGroupedFields(groupFieldsByHeader(selectedOrganism.inputFields, selectedOrganism.metadata));
        }
    }, [selectedOrganism]);

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

            {selectedOrganism && (
                <div className='mt-6'>
                    <h1 className='text-2xl font-bold mb-4'>{selectedOrganism.displayName}</h1>
                    <div>
                        You can download all metadata fields and their descriptions here:{' '}
                        <a
                            href={routes.metadataOverview(selectedOrganism.key)}
                            className='text-primary-700  opacity-90'
                        >
                            metadata_fields_descriptions.csv
                        </a>
                    </div>
                    {Array.from(groupedFields.entries()).map(([header, fields]) => (
                        <div key={header} className='mb-8'>
                            <h3
                                className='text-lg font-semibold mb-4 cursor-pointer'
                                onClick={() => toggleHeader(header)}
                            >
                                {header}
                                <IwwaArrowDown className='inline-block -mt-1 ml-1 h-4 w-4' />
                            </h3>
                            <div
                                className={`transition-all duration-300 ${
                                    expandedHeaders.has(header) ? 'block' : 'sr-only'
                                }`}
                                data-table-header={header}
                            >
                                <MetadataTable fields={fields} metadata={selectedOrganism.metadata} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default OrganismTableSelector;

type TableProps = {
    fields: InputField[];
    metadata: Metadata[];
};

const MetadataTable: FC<TableProps> = ({ fields, metadata }) => {
    return (
        <table className='table-auto border-collapse border border-gray-200 w-full'>
            <thead>
                <tr>
                    <th className='border border-gray-300 px-4 py-2 w-[20%]'>Field Name</th>
                    <th className='border border-gray-300 px-4 py-2 w-[13%]'>Type</th>
                    <th className='border border-gray-300 px-4 py-2 w-[37%]'>Description</th>
                    <th className='border border-gray-300 px-4 py-2 w-[30%]'>Example</th>
                </tr>
            </thead>
            <tbody>
                {fields.map((field) => {
                    const metadataEntry = metadata.find((meta) => meta.name === field.name);

                    return (
                        <tr key={field.name}>
                            <td className='border border-gray-300 px-4 py-2'>{field.name}</td>
                            <td className='border border-gray-300 px-4 py-2'>{metadataEntry?.type ?? 'String'}</td>
                            <td className='border border-gray-300 px-4 py-2'>{`${field.definition ?? ''} ${field.guidance ?? ''}`}</td>
                            <td className='border border-gray-300 px-4 py-2'>{field.example ?? ''}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
