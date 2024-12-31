import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import { BaseDialog } from '../../common/BaseDialog';

export class ColumnMapping {
    private readonly map: ReadonlyMap<string, string>;
    private readonly displayNames: ReadonlyMap<string, string | undefined>;

    private constructor(map: ReadonlyMap<string, string>, displayNames: ReadonlyMap<string, string | undefined>) {
        this.map = map;
        this.displayNames = displayNames;
    }

    /* Create a new mapping with the given columns, doing a best-effort to pre-match columns. */
    public static fromColumns(sourceColumns: string[], targetColumns: Map<string, string | undefined>) {
        const mapping = new Map<string, string>();
        [...targetColumns.entries()].forEach(([targetColumn, targetColumnDisplayName]) => {
            // TODO improve with fuzzy matching
            if (sourceColumns.includes(targetColumn)) {
                mapping.set(targetColumn, targetColumn);
                // TODO improve with fuzzy matching
            } else if (targetColumnDisplayName !== undefined && sourceColumns.includes(targetColumnDisplayName)) {
                mapping.set(targetColumn, targetColumnDisplayName);
            } else {
                mapping.set(targetColumn, sourceColumns[0]);
            }
        });
        return new ColumnMapping(mapping, targetColumns);
    }

    /* Update the mapping with new source and target columns, trying to keep as much of the 
       mapping intact as possible. */
    public update(newSourceColumns: string[], newTargetColumns: Map<string, string | undefined>): ColumnMapping {
        const newMapping = new Map<string, string>();
        [...newTargetColumns.entries()].forEach(([targetColumn, _targetColumnDisplayName]) => {
            const prevSourceCol = this.map.get(targetColumn);
            if (prevSourceCol && newSourceColumns.includes(prevSourceCol)) {
                newMapping.set(targetColumn, prevSourceCol);
            } else {
                // TODO improve this
                newMapping.set(targetColumn, newSourceColumns[0]);
            }
        });
        return new ColumnMapping(newMapping, newTargetColumns);
    }

    public entries(): [string, string | undefined, string][] {
        return Array.from(this.map.entries()).map(([targetCol, sourceCol]) => [
            targetCol,
            this.displayNames.get(targetCol),
            sourceCol,
        ]);
    }

    public updateWith(k: string, v: string): ColumnMapping {
        const newMapping = new Map(this.map);
        newMapping.set(k, v);
        return new ColumnMapping(newMapping, this.displayNames);
    }

    /* Apply this mapping to a TSV file, returning a new file with remapped columns. */
    public async applyTo(tsvFile: File): Promise<File> {
        const text = await tsvFile.text();
        const inputRows = text.split('\n');
        const headersInFile = inputRows.splice(0, 1)[0].split('\t');
        const headers: string[] = [];
        const indicies: number[] = [];
        this.entries().forEach(([k, v]) => {
            headers.push(k);
            indicies.push(headersInFile.findIndex((s) => s === v));
        });
        const newRows = inputRows.map((r) => r.split('\t')).map((row) => indicies.map((i) => row[i]));
        const newFileContent = [headers, ...newRows].map((row) => row.join('\t')).join('\n');
        return new File([newFileContent], 'remapped.tsv');
    }
}

interface ColumnMappingModalProps {
    inputFile: File;
    columnMapping: ColumnMapping | null;
    setColumnMapping: (newMapping: ColumnMapping) => void;
    possibleTargetColumns: Map<string, string | undefined>;
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
                                    <th className='pr-12 py-2'>Submission column</th>
                                    <th>Column in your file</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentMapping.entries().map(([targetCol, targetColDisplayName, sourceCol]) => (
                                    <ColumnSelectorRow
                                        key={targetCol}
                                        selectingFor={targetCol}
                                        selectingForDisplayName={targetColDisplayName}
                                        selectedOption={sourceCol}
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
    selectingForDisplayName: string | undefined;
    options: string[];
    selectedOption: string;
    setColumnMapping: Dispatch<SetStateAction<ColumnMapping | null>>;
}

export const ColumnSelectorRow: FC<ColumnSelectorRowProps> = ({
    selectingFor,
    selectingForDisplayName,
    options,
    selectedOption,
    setColumnMapping,
}) => {
    return (
        <tr key={selectingFor} className='border-gray-400 border-solid border-x-0 border-y'>
            <td className='pr-4'>
                {selectingForDisplayName ? (
                    <>
                        {selectingForDisplayName} (<span className='font-mono'>{selectingFor}</span>)
                    </>
                ) : (
                    <>{selectingFor}</>
                )}
            </td>
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
