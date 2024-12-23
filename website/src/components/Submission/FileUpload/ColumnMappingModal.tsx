import { useEffect, useState, type FC } from 'react';

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

    const [currentMapping, setCurrentMapping] = useState(columnMapping);
    const [inputColumns, setInputColumns] = useState<string[] | null>(null);

    useEffect(() => {
        let cols = inputColumns;
        if (cols === null) {
            cols = extractColumns(inputFile);
        }
        setCurrentMapping(generateBestEffortMapping(cols, possibleTargetColumns, currentMapping));
        if (inputColumns !== cols) {
            setInputColumns(cols);
        }
    });

    const handleSubmit = () => {
        if (currentMapping !== null) {
            setColumnMapping(currentMapping);
        }
        closeDialog();
    };

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
                    <>
                        {Array.from(currentMapping.entries()).map(([k, v]) => {
                            <>
                                <p>
                                    {k}: {v} ({inputColumns.join(', ')})
                                </p>
                            </>;
                        })}
                        <button onClick={handleSubmit}>submit</button>
                    </>
                )}
            </BaseDialog>
        </>
    );
};

function extractColumns(_tsvFile: File): string[] {
    // TODO read file in chunks until first line is read entirely
    // split line at tabs
    // return the columns
    return ['foo', 'bar'];
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
