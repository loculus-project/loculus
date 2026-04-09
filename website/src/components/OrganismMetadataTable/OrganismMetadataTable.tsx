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

    const groupedGeneratedFields = useMemo(() => {
        const groupedFields = new Map<string, Metadata[]>();
        const inputFieldNames = new Set(
            Array.from(organism.groupedInputFields.values())
                .flat()
                .map((field) => field.name),
        );

        organism.metadata
            .filter((field: Metadata) => !inputFieldNames.has(field.name))
            .forEach((field) => {
                const header = field.header ?? 'Other';
                if (groupedFields.has(header)) groupedFields.get(header)?.push(field);
                else groupedFields.set(header, [field]);
            });
        return groupedFields;
    }, [organism]);

    return (
        <div className='mt-6 mb-2'>
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
                            <MetadataTableSection
                                key={header}
                                header={header}
                                metadata={organism.metadata}
                                fields={inputFields}
                                isInputFields
                            />
                        ))}
                    </div>
                )}
                {activeTab === FieldType.GENERATED && (
                    <div className='mt-4'>
                        {Array.from(groupedGeneratedFields.entries()).map(([header, generatedFields]) => (
                            <MetadataTableSection
                                key={header}
                                header={header}
                                metadata={organism.metadata}
                                fields={generatedFields}
                            />
                        ))}
                    </div>
                )}
            </BoxWithTabsBox>
        </div>
    );
};

type MetadataTableProps =
    | { metadata: Metadata[]; fields: Metadata[]; isInputFields?: false }
    | { metadata: Metadata[]; fields: InputField[]; isInputFields: true };

type MetadataTableSectionProps = MetadataTableProps & { header: string };

const MetadataTableSection: FC<MetadataTableSectionProps> = ({ header, ...metadataTableProps }) => {
    const [expandedHeader, setExpandedHeader] = useState<boolean>(true);

    return (
        <div key={header} className='mb-8'>
            <h3
                className='text-lg font-semibold mb-4 cursor-pointer'
                onClick={() => setExpandedHeader((prev) => !prev)}
            >
                {header}
                <IwwaArrowDown
                    className={`inline-block -mt-1 ml-1 h-4 w-4 transition-transform duration-300 ${
                        expandedHeader ? '' : '-rotate-90'
                    }`}
                />
            </h3>
            <div
                className={`transition-all duration-300 ${expandedHeader ? 'block' : 'sr-only'}`}
                data-table-header={header}
            >
                <MetadataTable {...metadataTableProps} />
            </div>
        </div>
    );
};

const MetadataTable: FC<MetadataTableProps> = (props) => {
    return (
        <table className='table-auto border-collapse border border-gray-200 w-full'>
            <thead>
                <tr>
                    <th className='border border-gray-300 px-4 py-2 w-[25%]'>Field name</th>
                    {props.isInputFields && <th className='border border-gray-300 px-4 py-2 w-[13%]'>Type</th>}
                    <th className='border border-gray-300 px-4 py-2 w-[37%]'>Description</th>
                    {props.isInputFields && <th className='border border-gray-300 px-4 py-2 w-[25%]'>Example</th>}
                </tr>
            </thead>
            <tbody>
                {props.isInputFields
                    ? props.fields.map((field) => {
                          const metadataEntry = props.metadata.find((meta) => meta.name === field.name);
                          return (
                              <tr key={field.name}>
                                  <td className='border border-gray-300 px-4 py-2'>{field.name}</td>
                                  <td className='border border-gray-300 px-4 py-2'>
                                      {metadataEntry?.type ?? 'string'}
                                  </td>
                                  <td className='border border-gray-300 px-4 py-2'>
                                      <FormattedText
                                          text={[field.definition, field.guidance].filter(Boolean).join(' ')}
                                      />
                                  </td>
                                  <td className='border border-gray-300 px-4 py-2'>{field.example ?? ''}</td>
                              </tr>
                          );
                      })
                    : props.fields.map((field) => (
                          <tr key={field.name}>
                              <td className='border border-gray-300 px-4 py-2'>{field.name}</td>
                              <td className='border border-gray-300 px-4 py-2'>
                                  <FormattedText text={field.definition ?? ''} />
                              </td>
                          </tr>
                      ))}
            </tbody>
        </table>
    );
};
