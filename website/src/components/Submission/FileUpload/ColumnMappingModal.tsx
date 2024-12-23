import { useMemo, useState, type FC } from 'react';

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

    const inputColumns = useMemo(() => extractColumns(inputFile), [inputFile]);

    const initalMapping = columnMapping ?? generateBestEffortMapping(inputColumns, possibleTargetColumns);

    const [currentMapping, _setCurrentMapping] = useState(initalMapping);

    const handleSubmit = () => {
        setColumnMapping(currentMapping);
        closeDialog();
    };

    // TODO render a button
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
                <p>{inputColumns.join(', ')}</p>
                <p>{possibleTargetColumns.join(', ')}</p>
                <button onClick={handleSubmit}>submit</button>
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

function generateBestEffortMapping(sourceColumns: string[], targetColumns: string[]): ColumnMapping {
    // TODO generate a best effort mapping based on column name similarity.
    // (and maybe column type?)
    return new Map(targetColumns.map((c) => [c, sourceColumns[0]]));
}
