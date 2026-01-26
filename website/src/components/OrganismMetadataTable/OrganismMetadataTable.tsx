import { type FC, useState } from 'react';

import type { OrganismMetadata } from './OrganismMetadataTableSelector.tsx';
import { routes } from '../../routes/routes.ts';
import type { InputField, Metadata } from '../../types/config.ts';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type Props = {
    organism: OrganismMetadata;
};

export const OrganismMetadataTable: FC<Props> = ({ organism }) => {
    const [expandedHeaders, setExpandedHeaders] = useState<Set<string>>(
        new Set(Array.from(organism.groupedInputFields.keys())),
    );

    const toggleHeader = (header: string) => {
        const updatedExpandedHeaders = new Set(expandedHeaders);
        if (updatedExpandedHeaders.has(header)) {
            updatedExpandedHeaders.delete(header); // Close the table if already expanded
        } else {
            updatedExpandedHeaders.add(header);
        }
        setExpandedHeaders(updatedExpandedHeaders);
    };

    return (
        <div className='mt-6'>
            <h1 className='text-2xl font-bold mb-4'>{organism.displayName}</h1>
            <div>
                You can download all metadata fields and their descriptions here:{' '}
                <a href={routes.metadataOverview(organism.key)} className='text-primary-700  opacity-90'>
                    metadata_fields_descriptions.csv
                </a>
            </div>
            {Array.from(organism.groupedInputFields.entries()).map(([header, fields]) => (
                <div key={header} className='mb-8'>
                    <h3 className='text-lg font-semibold mb-4 cursor-pointer' onClick={() => toggleHeader(header)}>
                        {header}
                        <IwwaArrowDown
                            className={`inline-block -mt-1 ml-1 h-4 w-4 transition-transform duration-300 ${
                                expandedHeaders.has(header) ? '' : '-rotate-90'
                            }`}
                        />
                    </h3>
                    <div
                        className={`transition-all duration-300 ${expandedHeaders.has(header) ? 'block' : 'sr-only'}`}
                        data-table-header={header}
                    >
                        <MetadataTable fields={fields} metadata={organism.metadata} />
                    </div>
                </div>
            ))}
        </div>
    );
};

type TableProps = {
    fields: InputField[];
    metadata: Metadata[];
};

const MetadataTable: FC<TableProps> = ({ fields, metadata }) => {
    return (
        <table className='table-auto border-collapse border border-gray-200 w-full'>
            <thead>
                <tr>
                    <th className='border border-gray-300 px-4 py-2 w-[25%]'>Field name</th>
                    <th className='border border-gray-300 px-4 py-2 w-[13%]'>Type</th>
                    <th className='border border-gray-300 px-4 py-2 w-[37%]'>Description</th>
                    <th className='border border-gray-300 px-4 py-2 w-[25%]'>Example</th>
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
