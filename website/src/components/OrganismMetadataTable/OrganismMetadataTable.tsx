import { type FC, useMemo, useState } from 'react';

import type { OrganismMetadata } from './OrganismMetadataTableSelector.tsx';
import { routes } from '../../routes/routes.ts';
import type { InputField, Metadata } from '../../types/config.ts';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs.tsx';
import { FormattedText } from '../common/FormattedText.tsx';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type Props = {
    organism: OrganismMetadata;
};

enum FieldType {
    INPUT = 'inputFields',
    GENERATED = 'generatedFields',
}

export const OrganismMetadataTable: FC<Props> = ({ organism }) => {
    const [activeTab, setActiveTab] = useState<FieldType>(FieldType.INPUT);
    const [expandedHeaders, setExpandedHeaders] = useState(new Set(Array.from(organism.groupedInputFields.keys())));

    const toggleHeader = (header: string) => {
        const updatedExpandedHeaders = new Set(expandedHeaders);
        if (updatedExpandedHeaders.has(header)) {
            updatedExpandedHeaders.delete(header); // Close the table if already expanded
        } else {
            updatedExpandedHeaders.add(header);
        }
        setExpandedHeaders(updatedExpandedHeaders);
    };

    const generatedFields = useMemo(
        () =>
            organism.metadata.filter(
                (field) =>
                    !Array.from(organism.groupedInputFields.values())
                        .flat()
                        .some((inputField) => inputField.name === field.name),
            ),
        [organism],
    );

    return (
        <div className='mt-6'>
            <h1 className='text-2xl font-bold mb-4'>{organism.displayName}</h1>
            <BoxWithTabsTabBar>
                <BoxWithTabsTab
                    key={FieldType.INPUT.valueOf()}
                    isActive={activeTab === FieldType.INPUT}
                    onClick={() => setActiveTab(FieldType.INPUT)}
                    label='Input fields'
                    classNames='text-base'
                />
                <BoxWithTabsTab
                    key={FieldType.GENERATED.valueOf()}
                    isActive={activeTab === FieldType.GENERATED}
                    onClick={() => setActiveTab(FieldType.GENERATED)}
                    label='Generated fields'
                    classNames='text-base'
                />
            </BoxWithTabsTabBar>
            <BoxWithTabsBox>
                {activeTab === FieldType.INPUT && (
                    <div className='mt-4'>
                        <div className='mb-4'>
                            You can download all input metadata fields (with their descriptions and examples) here:{' '}
                            <a href={routes.metadataOverview(organism.key)} className='text-primary-700 opacity-90'>
                                {`${organism.displayName.replaceAll(' ', '_')}_metadata_overview.tsv`}
                            </a>
                        </div>
                        {Array.from(organism.groupedInputFields.entries()).map(([header, inputFields]) => (
                            <div key={header} className='mb-8'>
                                <h3
                                    className='text-lg font-semibold mb-4 cursor-pointer'
                                    onClick={() => toggleHeader(header)}
                                >
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
                                    <MetadataTable fields={inputFields} metadata={organism.metadata} isInputFields />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {activeTab === FieldType.GENERATED && (
                    <div className='mt-4'>
                        <MetadataTable fields={generatedFields} metadata={organism.metadata} />
                    </div>
                )}
            </BoxWithTabsBox>
        </div>
    );
};

type TableProps = {
    fields: InputField[];
    metadata: Metadata[];
    isInputFields?: boolean;
};

const MetadataTable: FC<TableProps> = ({ fields, metadata, isInputFields = false }) => {
    return (
        <table className='table-auto border-collapse border border-gray-200 w-full'>
            <thead>
                <tr>
                    <th className='border border-gray-300 px-4 py-2 w-[25%]'>Field name</th>
                    {isInputFields && <th className='border border-gray-300 px-4 py-2 w-[13%]'>Type</th>}
                    <th className='border border-gray-300 px-4 py-2 w-[37%]'>Description</th>
                    {isInputFields && <th className='border border-gray-300 px-4 py-2 w-[25%]'>Example</th>}
                </tr>
            </thead>
            <tbody>
                {fields.map((field) => {
                    const metadataEntry = metadata.find((meta) => meta.name === field.name);

                    return (
                        <tr key={field.name}>
                            <td className='border border-gray-300 px-4 py-2'>{field.name}</td>
                            {isInputFields && (
                                <td className='border border-gray-300 px-4 py-2'>{metadataEntry?.type ?? 'String'}</td>
                            )}
                            <td className='border border-gray-300 px-4 py-2'>
                                <FormattedText text={[field.definition, field.guidance].filter(Boolean).join(' ')} />
                            </td>
                            {isInputFields && (
                                <td className='border border-gray-300 px-4 py-2'>{field.example ?? ''}</td>
                            )}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
