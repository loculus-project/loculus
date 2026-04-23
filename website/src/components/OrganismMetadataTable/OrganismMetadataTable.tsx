import { type FC, useEffect, useMemo, useState } from 'react';

import type { OrganismMetadata } from './OrganismMetadataTableSelector.tsx';
import { routes } from '../../routes/routes.ts';
import type { InputField, Metadata } from '../../types/config.ts';
import { getUrl } from '../../utils/getUrl.ts';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs.tsx';
import { Button } from '../common/Button.tsx';
import { FormattedText } from '../common/FormattedText.tsx';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

export enum TableQueryParams {
    ORGANISM = 'organism',
    FIELD_TYPE = 'fieldType',
}

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

type MetadataSearchBarProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
};

const MetadataSearchBar: FC<MetadataSearchBarProps> = ({ value, onChange, placeholder }) => {
    return (
        <input
            type='search'
            placeholder={placeholder ?? 'Search fields...'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className='w-1/3 border border-gray-300 px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-600 focus:border-primary-600'
        />
    );
};

export const OrganismMetadataTable: FC<{ organism: OrganismMetadata }> = ({ organism }) => {
    const [activeTab, setActiveTab] = useState<FieldType | null>(null);
    const [showDisplayNames, setShowDisplayNames] = useState<boolean>(false);
    const [inputFieldSearch, setInputFieldSearch] = useState<string>('');
    const [generatedFieldSearch, setGeneratedFieldSearch] = useState<string>('');

    // Mapping of input fields to their corresponding metadata
    // Some input fields, such as extraInputFields in the config, do not have corresponding metadata
    const inputFieldsMetadata = useMemo(() => {
        const inputFieldNames = [
            ...new Set(
                Array.from(organism.groupedInputFields.values())
                    .flat()
                    .map((field) => field.name),
            ),
        ];

        const organismMetadataMap = new Map(organism.metadata.map((meta) => [meta.name, meta]));
        return new Map(inputFieldNames.map((fieldName) => [fieldName, organismMetadataMap.get(fieldName)]));
    }, [organism]);

    // Generated fields grouped by header
    const groupedGeneratedFields = useMemo(() => {
        const groupedFields = new Map<string, Metadata[]>();

        organism.metadata
            .filter((field: Metadata) => !inputFieldsMetadata.has(field.name) && !field.hideInSearchResultsTable)
            .forEach((field) => {
                const header = field.header ?? 'Other';
                if (groupedFields.has(header)) groupedFields.get(header)?.push(field);
                else groupedFields.set(header, [field]);
            });
        return groupedFields;
    }, [organism]);

    // Set the initial active tab based on the URL parameter
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setActiveTab(
            params.get(TableQueryParams.FIELD_TYPE) === FieldType.GENERATED ? FieldType.GENERATED : FieldType.INPUT,
        );
    }, []);

    // Scroll to the field in the URL hash when the component mounts or when the active tab changes
    useEffect(() => {
        if (!activeTab) return;
        const fieldLinkId = window.location.hash.slice(1); // Remove the '#' from the hash
        const field = fieldLinkId.split('-').pop();
        if (field) {
            // Check if the correct tab is active for the field in the URL hash
            const isInputField = inputFieldsMetadata.has(field);
            const fieldTab = isInputField ? FieldType.INPUT : FieldType.GENERATED;
            if (activeTab === fieldTab) scrollElementIntoView(fieldLinkId);
        }
    }, [activeTab]);

    const handleTabSelect = (fieldType: FieldType) => {
        setActiveTab(fieldType);
        const params = new URLSearchParams(window.location.search);
        params.set(TableQueryParams.FIELD_TYPE, fieldType);
        const newUrl = getUrl(window.location.origin, window.location.pathname, params);
        window.history.replaceState({ path: newUrl }, '', newUrl);
    };

    return (
        <div className='mt-6 mb-2'>
            <h1 className='text-2xl font-bold mb-4'>{organism.displayName}</h1>
            <BoxWithTabsTabBar>
                <BoxWithTabsTab
                    key={FieldType.INPUT.valueOf()}
                    isActive={activeTab === FieldType.INPUT}
                    onClick={() => handleTabSelect(FieldType.INPUT)}
                    label='Input fields'
                    className='text-base'
                />
                <BoxWithTabsTab
                    key={FieldType.GENERATED.valueOf()}
                    isActive={activeTab === FieldType.GENERATED}
                    onClick={() => handleTabSelect(FieldType.GENERATED)}
                    label='Generated fields'
                    className='text-base'
                />
                <label className='ml-auto flex items-center gap-2 text-sm cursor-pointer p-2'>
                    <input
                        type='checkbox'
                        className='h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600 cursor-pointer'
                        checked={showDisplayNames}
                        onChange={(e) => setShowDisplayNames(e.target.checked)}
                    />
                    Show display names
                </label>
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
                        <MetadataSearchBar
                            value={inputFieldSearch}
                            onChange={setInputFieldSearch}
                            placeholder='Search input fields...'
                        />
                        {Array.from(organism.groupedInputFields.entries()).map(([header, inputFields]) => {
                            const typedInputFields = inputFields.map((field) => ({
                                ...field,
                                type: inputFieldsMetadata.get(field.name)?.type ?? 'string',
                            }));
                            return (
                                <MetadataTableSection
                                    key={header}
                                    header={header}
                                    metadata={organism.metadata}
                                    fields={typedInputFields}
                                    showDisplayNames={showDisplayNames}
                                    search={inputFieldSearch}
                                    isInputFields
                                />
                            );
                        })}
                    </div>
                )}
                {activeTab === FieldType.GENERATED && (
                    <div className='mt-4'>
                        <MetadataSearchBar
                            value={generatedFieldSearch}
                            onChange={setGeneratedFieldSearch}
                            placeholder='Search generated fields...'
                        />
                        {Array.from(groupedGeneratedFields.entries()).map(([header, generatedFields]) => (
                            <MetadataTableSection
                                key={header}
                                header={header}
                                metadata={organism.metadata}
                                fields={generatedFields}
                                showDisplayNames={showDisplayNames}
                                search={generatedFieldSearch}
                            />
                        ))}
                    </div>
                )}
            </BoxWithTabsBox>
        </div>
    );
};

type TypedInputField = InputField & { type: string };

type MetadataTableProps =
    | {
          header: string;
          metadata: Metadata[];
          fields: Metadata[];
          showDisplayNames: boolean;
          search: string;
          isInputFields?: false;
      }
    | {
          header: string;
          metadata: Metadata[];
          fields: TypedInputField[];
          showDisplayNames: boolean;
          search: string;
          isInputFields: true;
      };

function containsSearch(field: Metadata | TypedInputField, search: string): boolean {
    const searchLower = search.toLowerCase();
    return (
        field.name.toLowerCase().includes(searchLower) ||
        field.type.toLowerCase().includes(searchLower) ||
        (field.displayName?.toLowerCase().includes(searchLower) ?? false) ||
        (field.definition?.toLowerCase().includes(searchLower) ?? false) ||
        ('guidance' in field && (field.guidance?.toLowerCase().includes(searchLower) ?? false)) ||
        (('example' in field && field.example?.toString().toLowerCase().includes(searchLower)) ?? false)
    );
}

const MetadataTableSection: FC<MetadataTableProps> = (props) => {
    const [expandedHeader, setExpandedHeader] = useState<boolean>(true);
    const filteredFields = props.search ? props.fields.filter((f) => containsSearch(f, props.search)) : props.fields;
    if (filteredFields.length === 0) return <></>;

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
                {props.isInputFields ? (
                    <MetadataTable {...props} fields={filteredFields as TypedInputField[]} />
                ) : (
                    <MetadataTable {...props} fields={filteredFields as Metadata[]} />
                )}
            </div>
        </div>
    );
};

const FieldNameCell: FC<{ header: string; field: TypedInputField | Metadata; showDisplayNames: boolean }> = ({
    header,
    field,
    showDisplayNames,
}) => {
    const handleFieldLink = () => {
        const params = new URLSearchParams(window.location.search);
        const fieldLinkId = getFieldLinkId(header, field.name);
        const newUrl = getUrl(window.location.origin, window.location.pathname, params, fieldLinkId);
        window.history.replaceState({ path: newUrl }, '', newUrl);
        scrollElementIntoView(fieldLinkId);
    };

    return (
        <div className='flex flex-col'>
            <div className='group flex items-center gap-2'>
                <span>{field.name}</span>
                <Button
                    onClick={handleFieldLink}
                    className='opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-primary-600'
                    title='Link to this field'
                >
                    ¶
                </Button>
            </div>
            {showDisplayNames && <span className='text-xs text-gray-500 mt-1'>{field.displayName}</span>}
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
                          return (
                              <tr id={getFieldLinkId(props.header, field.name)} key={field.name}>
                                  <td className='border border-gray-300 px-4 py-2'>
                                      <FieldNameCell
                                          header={props.header}
                                          field={field}
                                          showDisplayNames={props.showDisplayNames}
                                      />
                                  </td>
                                  <td className='border border-gray-300 px-4 py-2'>{field.type}</td>
                                  <td className='border border-gray-300 px-4 py-2'>
                                      <FormattedText
                                          text={[field.definition, field.guidance].filter(Boolean).join(' ')}
                                          formatLinks
                                      />
                                  </td>
                                  <td className='border border-gray-300 px-4 py-2'>{field.example ?? ''}</td>
                              </tr>
                          );
                      })
                    : props.fields.map((field) => (
                          <tr id={getFieldLinkId(props.header, field.name)} key={field.name}>
                              <td className='border border-gray-300 px-4 py-2'>
                                  <FieldNameCell
                                      header={props.header}
                                      field={field}
                                      showDisplayNames={props.showDisplayNames}
                                  />
                              </td>
                              <td className='border border-gray-300 px-4 py-2'>
                                  <FormattedText text={field.definition ?? ''} formatLinks />
                              </td>
                          </tr>
                      ))}
            </tbody>
        </table>
    );
};
