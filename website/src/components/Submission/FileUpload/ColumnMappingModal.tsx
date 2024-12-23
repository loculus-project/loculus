import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import { BaseDialog } from '../../common/BaseDialog';
import type { ColumnMapping } from '../DataUploadForm';

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
                onClick={(e) => {
                    e.preventDefault();
                    openDialog();
                }}
            >
                Map Columns
            </button>
            <BaseDialog title='Remap Columns' isOpen={isOpen} onClose={closeDialog}>
                {currentMapping === null || inputColumns === null ? (
                    'Loading ...'
                ) : (
                    <div className='space-y-4'>
                        <table>
                            <thead>
                                <tr>
                                    <th className='pr-4'>Upload column</th>
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
                            <button className='btn loculusColor text-white' onClick={handleSubmit} disabled={!isChanged}>
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
        // TODO use previous mappings where possible, else look for a good column
        return previousMapping;
    } else {
        // generate new best effor from scratch based on column similarity
        return new Map(targetColumns.map((c) => [c, sourceColumns[0]]));
    }
}

interface ColumnSelectorRowProps {
    selectingFor: string;
    options: string[];
    selectedOption: string;
    setColumnMapping: Dispatch<SetStateAction<ColumnMapping | null>>;
}

export const ColumnSelectorRow: FC<ColumnSelectorRowProps> = ({ selectingFor, options, selectedOption, setColumnMapping }) => {
    return (
        <tr key={selectingFor}>
            <td>{selectingFor}</td>
            <td>
                <select defaultValue={selectedOption} onChange={e => {
                    setColumnMapping(currentMapping => {
                        const newMap = new Map(currentMapping);
                        newMap.set(selectingFor, e.target.value)
                        return newMap;
                    })
                }}>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
            </td>
        </tr>
    );
};
