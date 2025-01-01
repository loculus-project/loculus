import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import { ColumnMapping } from './ColumnMapping';
import { BaseDialog } from '../../common/BaseDialog';

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
