import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import { BaseDialog } from '../../common/BaseDialog';

/* The keys are the output columns, and the values are the column names in the input file. */
export type ColumnMapping = Map<string, string>;

interface ColumnMappingModalProps {
    inputFile: File;
    columnMapping: ColumnMapping | null;
    setColumnMapping: (newMapping: ColumnMapping) => void;
    possibleTargetColumns: string[];
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
        if (inputColumns === null) {
            const loadColumns = async () => {
                setInputColumns(await extractColumns(inputFile));
            };
            void loadColumns();
            return;
        }
        setCurrentMapping(generateBestEffortMapping(inputColumns, possibleTargetColumns, columnMapping));
    }, [inputColumns, columnMapping, possibleTargetColumns, setCurrentMapping, setInputColumns]);

    const handleSubmit = () => {
        if (currentMapping !== null) {
            setColumnMapping(currentMapping);
        }
        closeDialog();
    };

    const isChanged = columnMapping !== currentMapping;

    return (
        <>
            <button
                className='text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
                onClick={(e) => {
                    e.preventDefault();
                    openDialog();
                }}
            >
                Map Columns
            </button>
            <BaseDialog title='Remap Columns' isOpen={isOpen} onClose={closeDialog} fullWidth={false}>
                {currentMapping === null || inputColumns === null ? (
                    'Loading ...'
                ) : (
                    <div className='space-y-8'>
                        <table>
                            <thead>
                                <tr>
                                    <th className='pr-12 py-2'>Upload column</th>
                                    <th>Input column</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from(currentMapping.entries()).map(([k, v]) => (
                                    <ColumnSelectorRow
                                        key={k}
                                        selectingFor={k}
                                        selectedOption={v}
                                        options={inputColumns}
                                        setColumnMapping={setCurrentMapping}
                                    />
                                ))}
                            </tbody>
                        </table>
                        <div className='flex flex-row gap-2 justify-end'>
                            <button className='btn' onClick={closeDialog}>
                                Cancel
                            </button>
                            <button
                                className='btn loculusColor text-white'
                                onClick={handleSubmit}
                                disabled={!isChanged}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                )}
            </BaseDialog>
        </>
    );
};

async function extractColumns(_tsvFile: File): Promise<string[]> {
    // TODO error handling if file content isn't right
    const text = await _tsvFile.text();
    // there is potential to optmize: don't read the whole file, just the header (read in chunks)
    return text.split('\n')[0].split('\t');
}

function generateBestEffortMapping(
    sourceColumns: string[],
    targetColumns: string[],
    previousMapping: ColumnMapping | null,
): ColumnMapping {
    if (previousMapping !== null) {
        const result: ColumnMapping = new Map();
        targetColumns.forEach((targetColumn) => {
            const prevSourceCol = previousMapping.get(targetColumn);
            if (prevSourceCol && sourceColumns.includes(prevSourceCol)) {
                result.set(targetColumn, prevSourceCol);
            } else {
                result.set(targetColumn, sourceColumns[0]);
            }
            return result;
        });
        // TODO use previous mappings where possible, else look for a good column
        return previousMapping;
    } else {
        const result: ColumnMapping = new Map();
        targetColumns.forEach((targetColumn) => {
            // TODO also check for display name similarity.
            if (sourceColumns.includes(targetColumn)) {
                result.set(targetColumn, targetColumn);
            } else {
                result.set(targetColumn, sourceColumns[0]);
            }
        });
        return result;
    }
}

interface ColumnSelectorRowProps {
    selectingFor: string;
    options: string[];
    selectedOption: string;
    setColumnMapping: Dispatch<SetStateAction<ColumnMapping | null>>;
}

export const ColumnSelectorRow: FC<ColumnSelectorRowProps> = ({
    selectingFor,
    options,
    selectedOption,
    setColumnMapping,
}) => {
    // TODO it would be cool to have the 'display name' for the columns available here
    return (
        <tr key={selectingFor} className='border-gray-400 border-solid border-x-0 border-y'>
            <td>{selectingFor}</td>
            <td>
                <select
                    className='rounded-md border-none px-0 py-1'
                    defaultValue={selectedOption}
                    onChange={(e) => {
                        setColumnMapping((currentMapping) => {
                            const newMap = new Map(currentMapping);
                            newMap.set(selectingFor, e.target.value);
                            return newMap;
                        });
                    }}
                >
                    {options.map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </select>
            </td>
        </tr>
    );
};
