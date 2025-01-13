import { Result, err, ok } from 'neverthrow';
import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';

import { ColumnMapping } from './ColumnMapping';
import { type ProcessedFile } from './fileProcessing';
import { BaseDialog } from '../../common/BaseDialog';
import { Tooltip } from 'react-tooltip';

interface ColumnMappingModalProps {
    inputFile: ProcessedFile;
    columnMapping: ColumnMapping | null;
    setColumnMapping: (newMapping: ColumnMapping | null) => void;
    possibleTargetColumns: Map<string, string | null>;
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
        if (columnMapping !== null) {
            setCurrentMapping(columnMapping.update(inputColumns, possibleTargetColumns));
        } else {
            setCurrentMapping(ColumnMapping.fromColumns(inputColumns, possibleTargetColumns));
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
    options: Map<string, string | null>;
    selectedOption: string | null;
    setColumnMapping: Dispatch<SetStateAction<ColumnMapping | null>>;
}

export const ColumnSelectorRow: FC<ColumnSelectorRowProps> = ({
    selectingFor,
    options,
    selectedOption,
    setColumnMapping,
}) => {
    return (
        <tr key={selectingFor} className='border-gray-400 border-solid border-x-0 border-y'>
            <td className='pr-4'>{selectingFor}</td>
            <td>
                <select
                    className='rounded-md border-none px-0 py-1'
                    defaultValue={selectedOption ?? ''}
                    onChange={(e) =>
                        setColumnMapping((currentMapping) =>
                            currentMapping!.updateWith(selectingFor, e.target.value === '' ? null : e.target.value),
                        )
                    }
                >
                    <option value=''>-</option>
                    {Array.from(options.entries()).map(([targetColumnName, targetColumnDisplayName]) => (
                        <option key={targetColumnName} value={targetColumnName}>
                            {targetColumnDisplayName ?? targetColumnName}
                        </option>
                    ))}
                </select>
            </td>
        </tr>
    );
};
