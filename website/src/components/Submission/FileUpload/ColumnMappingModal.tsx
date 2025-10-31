import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Result, err, ok } from 'neverthrow';
import Papa from 'papaparse';
import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';
import { Tooltip } from 'react-tooltip';

import { ColumnMapping } from './ColumnMapping';
import { type ProcessedFile } from './fileProcessing';
import type { InputField } from '../../../types/config';
import { BaseDialog } from '../../common/BaseDialog';
import { Button } from '../../common/Button';
import { InputFieldTooltip } from '../InputFieldTooltip';

interface ColumnMappingModalProps {
    inputFile: ProcessedFile;
    columnMapping: ColumnMapping | null;
    setColumnMapping: (newMapping: ColumnMapping | null) => void;
    groupedInputFields: Map<string, InputField[]>;
}

export const ColumnMappingModal: FC<ColumnMappingModalProps> = ({
    inputFile,
    columnMapping,
    setColumnMapping,
    groupedInputFields,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);
    const [currentMapping, setCurrentMapping] = useState<ColumnMapping | null>(null);
    const [inputColumns, setInputColumns] = useState<string[] | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const loadColumns = async () => {
            const columnExtractionResult = await extractColumns(inputFile);
            columnExtractionResult.match(
                (inputColumns) => setInputColumns(inputColumns),
                (error) => {
                    toast.error(`Could not read file header: ${error.message}`);
                    setIsOpen(false); // close dialog on error.
                },
            );
        };
        void loadColumns();
    }, [isOpen, inputFile, setInputColumns]);

    useEffect(() => {
        if (inputColumns === null) return;
        const inputFields = Array.from(groupedInputFields.values()).flat();
        if (columnMapping !== null) {
            setCurrentMapping(columnMapping.update(inputColumns, inputFields));
        } else {
            setCurrentMapping(ColumnMapping.fromColumns(inputColumns, inputFields));
        }
    }, [inputColumns, columnMapping, groupedInputFields, setCurrentMapping]);

    const handleSubmit = () => {
        setColumnMapping(currentMapping);
        closeDialog();
    };

    const handleDiscard = () => {
        setColumnMapping(null);
        closeDialog();
    };

    const requiredFieldsWithDuplicates = Array.from(groupedInputFields.values())
        .flat()
        .filter((f) => f.required);
    const requiredFields = requiredFieldsWithDuplicates.filter(
        (f, i) => requiredFieldsWithDuplicates.findIndex((x) => x.name === f.name) === i,
    );
    const missingFields = requiredFields.filter((field) => !currentMapping?.usedColumns().includes(field.name));

    const isChanged = !columnMapping?.equals(currentMapping);
    const submittable = isChanged && missingFields.length === 0;

    const openModalButtonText = columnMapping !== null ? 'Edit column mapping' : 'Add column mapping';
    const saveButtonText = columnMapping === null ? 'Add this mapping' : 'Save';
    const minWidthStyle = calculateMinWidthStyleFromPossibleOptions(groupedInputFields);

    return (
        <>
            <Button
                className='text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
                data-tooltip-id='columnMapping'
                onClick={(e) => {
                    e.preventDefault();
                    openDialog();
                }}
            >
                {openModalButtonText}
            </Button>
            <Tooltip
                id='columnMapping'
                place='bottom'
                globalCloseEvents={{ scroll: true, clickOutsideAnchor: true }}
                // Don't open on focus, as otherwise closing the dialog will reopen tooltip
                openEvents={{ mouseenter: true, focus: false }}
                closeEvents={{ mouseleave: true, blur: true }}
            >
                If your metadata file does not use the defined field names, this allow you
                <br />
                to map columns in your file to the fields expected by the database.
            </Tooltip>
            <BaseDialog title='Remap columns' isOpen={isOpen} onClose={closeDialog} fullWidth={false}>
                {currentMapping === null || inputColumns === null ? (
                    'Loading ...'
                ) : (
                    <div className='space-y-4'>
                        <table>
                            <thead>
                                <tr>
                                    <th className='py-2 sm:min-w-56'>Column in your file</th>
                                    <th style={minWidthStyle}>Submission column</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentMapping.entries().map(([sourceCol, targetCol]) => (
                                    <ColumnSelectorRow
                                        key={sourceCol}
                                        selectingFor={sourceCol}
                                        selectedOption={targetCol}
                                        options={groupedInputFields}
                                        usedOptions={currentMapping.usedColumns()}
                                        setColumnMapping={setCurrentMapping}
                                    />
                                ))}
                            </tbody>
                        </table>
                        <div className='min-h-6 text-sm'>
                            {missingFields.length > 0 && 'All required fields need to be set to apply this mapping.'}
                        </div>
                        <div className='flex flex-row gap-2 justify-end'>
                            {columnMapping !== null && (
                                <>
                                    <Button
                                        className='btn bg-white text-red-800 border-red-800'
                                        onClick={handleDiscard}
                                    >
                                        Discard Mapping
                                    </Button>
                                    <div className='flex-1' />
                                </>
                            )}
                            <Button className='btn' onClick={closeDialog}>
                                Cancel
                            </Button>
                            <Button
                                className='btn loculusColor text-white'
                                onClick={handleSubmit}
                                disabled={!submittable}
                            >
                                {saveButtonText}
                            </Button>
                        </div>
                    </div>
                )}
            </BaseDialog>
        </>
    );
};

async function extractColumns(tsvFile: ProcessedFile): Promise<Result<string[], Error>> {
    let text;
    try {
        text = await tsvFile.text();
    } catch (error) {
        return Promise.resolve(err(error as Error));
    }
    const parsed = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true });
    return ok(parsed.data[0]);
}

interface ColumnSelectorRowProps {
    selectingFor: string;
    options: Map<string, InputField[]>;
    usedOptions: string[];
    selectedOption: string | null;
    setColumnMapping: Dispatch<SetStateAction<ColumnMapping | null>>;
}

export const ColumnSelectorRow: FC<ColumnSelectorRowProps> = ({
    selectingFor,
    options,
    usedOptions,
    selectedOption,
    setColumnMapping,
}) => {
    const selectedField = selectedOption
        ? Array.from(options.values())
              .flat()
              .find((o) => o.name === selectedOption)
        : undefined;
    const selectedOptionText = selectedField?.displayName ?? selectedField?.name;
    const isExactMatch = selectedField?.displayName === selectingFor || selectedField?.name === selectingFor;

    const minWidthStyle = calculateMinWidthStyleFromPossibleOptions(options);

    const inputFieldToListboxOption = (header: string, field: InputField): React.JSX.Element => (
        <ListboxOption
            key={`${header}-${field.name}`}
            value={field.name}
            className={`data-[focus]:bg-primary-200 p-1 pl-3 rounded-sm ${selectedOption === field.name ? 'bg-gray-200' : ''}`}
            data-tooltip-id={`${header}-${field.name}-tooltip`}
        >
            <span className={usedOptions.includes(field.name) ? 'text-gray-400' : ''}>
                {field.displayName ?? field.name}
            </span>
            <InputFieldTooltip id={`${header}-${field.name}-tooltip`} field={field} />
        </ListboxOption>
    );

    return (
        <tr key={selectingFor} className='border-gray-400 border-solid border-x-0 border-y'>
            <td className='pr-4'>{selectingFor}</td>
            <td style={minWidthStyle}>
                <Listbox
                    value={selectedOption}
                    onChange={(newValue) =>
                        setColumnMapping((currentMapping) => currentMapping!.updateWith(selectingFor, newValue))
                    }
                >
                    <ListboxButton className='rounded-md border-none px-0 py-1 w-full pr-2'>
                        <div className='flex flex-row w-full mr-0'>
                            {selectedOption ? (
                                <span className={isExactMatch ? '' : 'italic'}>{selectedOptionText}</span>
                            ) : (
                                <span className='italic text-gray-400'>unmapped</span>
                            )}
                            <div className='flex-1' />
                            <span className='ml-2 mb-1 rotate-180 text-gray-500'>
                                <svg
                                    xmlns='http://www.w3.org/2000/svg'
                                    className='h-4 w-4'
                                    viewBox='0 0 20 20'
                                    fill='currentColor'
                                >
                                    <path fillRule='evenodd' d='M10 3l7 10H3l7-10z' />
                                </svg>
                            </span>
                        </div>
                    </ListboxButton>
                    <ListboxOptions anchor='top' className='bg-gray-100 p-1 rounded-sm text-sm'>
                        <ListboxOption key={''} value={null} className='data-[focus]:bg-primary-200 p-1'>
                            <span className='italic'>unmapped</span>
                        </ListboxOption>
                        <div key='border' className='w-10/12 mx-auto my-1 h-0.5 bg-gray-200'></div>
                        {Array.from(options.entries()).map(([header, fields]) => {
                            if (fields.length === 0) return;
                            return (
                                <div key={header} className='pt-1'>
                                    <div className='p-1 font-semibold'>{header}</div>
                                    {fields.map((field) => inputFieldToListboxOption(header, field))}
                                </div>
                            );
                        })}
                    </ListboxOptions>
                </Listbox>
            </td>
        </tr>
    );
};

/* Estimate the min width of a column with select for these input fields,
 * so you don't get layout shifts when selecting different, longer, values. */
function calculateMinWidthStyleFromPossibleOptions(options: Map<string, InputField[]>): React.CSSProperties {
    const maxOptionTextLength = Math.max(
        ...Array.from(options.values())
            .flat()
            .flatMap((x) => [x.name, x.displayName])
            .map((text) => text?.length ?? 0),
    );

    return { minWidth: `${Math.ceil(maxOptionTextLength / 2) + 2}rem` };
}
