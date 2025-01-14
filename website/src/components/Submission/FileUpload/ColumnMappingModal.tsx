import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Result, err, ok } from 'neverthrow';
import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';
import { Tooltip } from 'react-tooltip';

import { ColumnMapping } from './ColumnMapping';
import { type ProcessedFile } from './fileProcessing';
import type { InputField } from '../../../types/config';
import { BaseDialog } from '../../common/BaseDialog';

interface ColumnMappingModalProps {
    inputFile: ProcessedFile;
    columnMapping: ColumnMapping | null;
    setColumnMapping: (newMapping: ColumnMapping | null) => void;
    possibleTargetColumns: Map<string, InputField[]>;
}

export const ColumnMappingModal: FC<ColumnMappingModalProps> = ({
    inputFile,
    columnMapping,
    setColumnMapping,
    possibleTargetColumns,
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
                () => toast.error('Could not read file header'),
            );
        };
        void loadColumns();
    }, [isOpen, inputFile, setInputColumns]);

    useEffect(() => {
        if (inputColumns === null) return;
        const targetColumnsWithDisplayNames = new Map<string, string | null>(
            Array.from(possibleTargetColumns.values())
                .flat()
                .map((inputField) => [inputField.name, inputField.displayName ?? null]),
        );
        if (columnMapping !== null) {
            setCurrentMapping(columnMapping.update(inputColumns, targetColumnsWithDisplayNames));
        } else {
            setCurrentMapping(ColumnMapping.fromColumns(inputColumns, targetColumnsWithDisplayNames));
        }
    }, [inputColumns, columnMapping, possibleTargetColumns, setCurrentMapping]);

    const handleSubmit = () => {
        setColumnMapping(currentMapping);
        closeDialog();
    };

    const handleDiscard = () => {
        setColumnMapping(null);
        closeDialog();
    };

    const isChanged = !columnMapping?.equals(currentMapping);
    const openModalButtonText = columnMapping !== null ? 'Edit column mapping' : 'Add column mapping';
    const saveButtonText = columnMapping === null ? 'Add this mapping' : 'Save';

    return (
        <>
            <button
                className='text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
                data-tooltip-id='columnMapping'
                onClick={(e) => {
                    e.preventDefault();
                    openDialog();
                }}
            >
                {openModalButtonText}
            </button>
            <Tooltip id='columnMapping' place='bottom'>
                If you are not using our metadata template, this allows you to map
                <br />
                columns in your file to the fields expected by the database.
            </Tooltip>
            <BaseDialog title='Remap Columns' isOpen={isOpen} onClose={closeDialog} fullWidth={false}>
                {currentMapping === null || inputColumns === null ? (
                    'Loading ...'
                ) : (
                    <div className='space-y-8'>
                        <table>
                            <thead>
                                <tr>
                                    <th className='pr-12 py-2'>Column in your file</th>
                                    <th>Submission column</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentMapping.entries().map(([sourceCol, targetCol]) => (
                                    <ColumnSelectorRow
                                        key={sourceCol}
                                        selectingFor={sourceCol}
                                        selectedOption={targetCol}
                                        options={possibleTargetColumns}
                                        usedOptions={currentMapping.usedColumns()}
                                        setColumnMapping={setCurrentMapping}
                                    />
                                ))}
                            </tbody>
                        </table>
                        <div className='flex flex-row gap-2 justify-end'>
                            {columnMapping !== null && (
                                <>
                                    <button
                                        className='btn bg-white text-red-800 border-red-800'
                                        onClick={handleDiscard}
                                    >
                                        Discard Mapping
                                    </button>
                                    <div className='flex-1' />
                                </>
                            )}
                            <button className='btn' onClick={closeDialog}>
                                Cancel
                            </button>
                            <button
                                className='btn loculusColor text-white'
                                onClick={handleSubmit}
                                disabled={!isChanged}
                            >
                                {saveButtonText}
                            </button>
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
        // there is potential to optimize: don't read the whole file, just the header (read in chunks)
        text = await tsvFile.text();
    } catch (error) {
        return Promise.resolve(err(error as Error));
    }
    return ok(text.split('\n')[0].split('\t'));
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
    const selectedOptionText = selectedOption
        ? Array.from(options.values())
              .flat()
              .find((o) => o.name === selectedOption)?.displayName
        : undefined;

    return (
        <tr key={selectingFor} className='border-gray-400 border-solid border-x-0 border-y'>
            <td className='pr-4'>{selectingFor}</td>
            <td>
                <Listbox
                    value={selectedOption}
                    onChange={(newValue) =>
                        setColumnMapping((currentMapping) => currentMapping!.updateWith(selectingFor, newValue))
                    }
                >
                    <ListboxButton className='rounded-md border-none px-0 py-1 w-full pr-2'>
                        <div className='flex flex-row w-full mr-0'>
                            {selectedOptionText ?? <span className='italic text-gray-400'>unmapped</span>}
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
                        <ListboxOption value={null} className='data-[focus]:bg-primary-200 p-1'>
                            <span className='italic'>unmapped</span>
                        </ListboxOption>
                        <div className='w-10/12 mx-auto my-1 h-0.5 bg-gray-200'></div>
                        {Array.from(options.entries()).map(([header, fields]) => {
                            if (fields.length === 0) return;
                            return (
                                <>
                                    <div className='p-1 pt-2 font-semibold'>{header}</div>
                                    {fields.map((field) => (
                                        <>
                                            <ListboxOption
                                                key={`${header}-${field.name}`}
                                                value={field.name}
                                                className='data-[focus]:bg-primary-200 p-1 pl-3 rounded-sm'
                                                data-tooltip-id={`${header}-${field.name}-tooltip`}
                                            >
                                                <span
                                                    className={usedOptions.includes(field.name) ? 'text-gray-400' : ''}
                                                >
                                                    {field.displayName ?? field.name}
                                                </span>
                                            </ListboxOption>
                                            {(field.definition ?? field.guidance) && (
                                                <Tooltip
                                                    id={`${header}-${field.name}-tooltip`}
                                                    place='right'
                                                    positionStrategy='fixed'
                                                    className='z-20 max-w-80'
                                                >
                                                    {field.definition} {field.guidance}
                                                </Tooltip>
                                            )}
                                        </>
                                    ))}
                                </>
                            );
                        })}
                    </ListboxOptions>
                </Listbox>
            </td>
        </tr>
    );
};
