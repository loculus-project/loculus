import { type FC, useEffect, useMemo, useState } from 'react';

import type { OrganismMetadata } from './OrganismMetadataTableSelector.tsx';
import { routes } from '../../routes/routes.ts';
import type { InputField, Metadata } from '../../types/config.ts';
import { getUrl } from '../../utils/getUrl.ts';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs.tsx';
import { Button } from '../common/Button.tsx';
import { FormattedText } from '../common/FormattedText.tsx';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type Props = {
    organism: OrganismMetadata;
};

enum FieldType {
    INPUT = 'inputFields',
    GENERATED = 'generatedFields',
}

function getFieldLinkId(header: string, name: string): string {
    return `${header.replaceAll(' ', '_')}-${name}`;
}

function scrollElementIntoView(id: string) {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export const OrganismMetadataTable: FC<Props> = ({ organism }) => {
    const [activeTab, setActiveTab] = useState<FieldType>(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('fieldType') === FieldType.GENERATED ? FieldType.GENERATED : FieldType.INPUT;
    });

    const inputFieldNames = new Set(
        Array.from(organism.groupedInputFields.values())
            .flat()
            .map((field) => field.name),
    );

    useEffect(() => {
        const fieldLinkId = window.location.hash.slice(1); // Remove the '#' from the hash
        const [header, field] = fieldLinkId.split('-');
        if (header && field) {
            // Check if the correct tab is active for the field in the URL hash
            const isInputField = inputFieldNames.has(field);
            const fieldTab = isInputField ? FieldType.INPUT : FieldType.GENERATED;
            if (activeTab === fieldTab) scrollElementIntoView(fieldLinkId);
        }
    }, [activeTab]);

    const handleTabSelect = (fieldType: FieldType) => {
        setActiveTab(fieldType);
        const params = new URLSearchParams(window.location.search);
        params.set('fieldType', fieldType);
        const newUrl = getUrl(window.location.origin, window.location.pathname, params, window.location.hash);
        window.history.replaceState({ path: newUrl }, '', newUrl);
    };

    const groupedGeneratedFields = useMemo(() => {
        const groupedFields = new Map<string, Metadata[]>();

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
                    onClick={() => handleTabSelect(FieldType.INPUT)}
                    label='Input fields'
                    classNames='text-base'
                />
                <BoxWithTabsTab
                    key={FieldType.GENERATED.valueOf()}
                    isActive={activeTab === FieldType.GENERATED}
                    onClick={() => handleTabSelect(FieldType.GENERATED)}
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
    | { header: string; metadata: Metadata[]; fields: Metadata[]; isInputFields?: false }
    | { header: string; metadata: Metadata[]; fields: InputField[]; isInputFields: true };

const MetadataTableSection: FC<MetadataTableProps> = (props) => {
    const [expandedHeader, setExpandedHeader] = useState<boolean>(true);

    return (
        <div key={props.header} className='mb-8'>
            <h3
                className='text-lg font-semibold mb-4 cursor-pointer'
                onClick={() => setExpandedHeader((prev) => !prev)}
            >
                {props.header}
                <IwwaArrowDown
                    className={`inline-block -mt-1 ml-1 h-4 w-4 transition-transform duration-300 ${
                        expandedHeader ? '' : '-rotate-90'
                    }`}
                />
            </h3>
            <div
                className={`transition-all duration-300 ${expandedHeader ? 'block' : 'sr-only'}`}
                data-table-header={props.header}
            >
                <MetadataTable {...props} />
            </div>
        </div>
    );
};

const FieldNameCell: FC<{ header: string; name: string }> = ({ header, name }) => {
    const handleFieldLink = () => {
        const params = new URLSearchParams(window.location.search);
        const fieldLinkId = getFieldLinkId(header, name);
        const newUrl = getUrl(window.location.origin, window.location.pathname, params, fieldLinkId);
        window.history.replaceState({ path: newUrl }, '', newUrl);
        scrollElementIntoView(fieldLinkId);
    };

    return (
        <div className='group flex items-center gap-2'>
            <span>{name}</span>
            <Button
                onClick={handleFieldLink}
                className='opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-primary-600'
                title='Copy link to the field'
            >
                ¶
            </Button>
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
                              <tr id={getFieldLinkId(props.header, field.name)} key={field.name}>
                                  <td className='border border-gray-300 px-4 py-2'>
                                      <FieldNameCell header={props.header} name={field.name} />
                                  </td>
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
                          <tr id={getFieldLinkId(props.header, field.name)} key={field.name}>
                              <td className='border border-gray-300 px-4 py-2'>
                                  <FieldNameCell header={props.header} name={field.name} />
                              </td>
                              <td className='border border-gray-300 px-4 py-2'>
                                  <FormattedText text={field.definition ?? ''} />
                              </td>
                          </tr>
                      ))}
            </tbody>
        </table>
    );
};
