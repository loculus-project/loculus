import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import { BaseDialog } from '../../common/BaseDialog';

export class ColumnMapping {
    private map: Map<string, string>;

    private constructor(map: Map<string, string>) {
        this.map = map;
    }

    public static fromColumns(sourceColumns: string[], targetColumns: string[]) {
        const mapping = new Map<string, string>();
        targetColumns.forEach((targetColumn) => {
            // TODO also check for display name similarity.
            if (sourceColumns.includes(targetColumn)) {
                mapping.set(targetColumn, targetColumn);
            } else {
                mapping.set(targetColumn, sourceColumns[0]);
            }
        });
        return new ColumnMapping(mapping);
    }

    public update(newSourceColumns: string[], newTargetColumns: string[]): ColumnMapping {
        const newMapping = new Map<string, string>();
        newTargetColumns.forEach((targetColumn) => {
            const prevSourceCol = this.map.get(targetColumn);
            if (prevSourceCol && newSourceColumns.includes(prevSourceCol)) {
                newMapping.set(targetColumn, prevSourceCol);
            } else {
                newMapping.set(targetColumn, newSourceColumns[0]);
            }
        });
        return new ColumnMapping(newMapping);
    }

    public entries(): [string, string][] {
        return Array.from(this.map.entries());
    }

    public updateWith(k: string, v: string): ColumnMapping {
        const newMapping = new Map(this.map);
        newMapping.set(k, v);
        return new ColumnMapping(newMapping);
    }
}

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
        if (columnMapping !== null) {
            setCurrentMapping(columnMapping.update(inputColumns, possibleTargetColumns));
        } else {
            setCurrentMapping(ColumnMapping.fromColumns(inputColumns, possibleTargetColumns));
        }
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
                                {currentMapping.entries().map(([k, v]) => (
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
                    onChange={(e) =>
                        setColumnMapping((currentMapping) => currentMapping!.updateWith(selectingFor, e.target.value))
                    }
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
