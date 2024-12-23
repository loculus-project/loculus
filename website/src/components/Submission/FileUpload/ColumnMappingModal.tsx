import type { FC } from "react";

import type { ColumnMapping } from "../DataUploadForm";

interface ColumnMappingModalProps {
    inputFile: File,
    columnMapping: ColumnMapping | null;
    setColumnMapping: (newMapping: ColumnMapping) => void;
    possibleTargetColumns: string[];
}


export const ColumnMappingModal: FC<ColumnMappingModalProps> = ({
    inputFile, columnMapping, setColumnMapping, possibleTargetColumns
}) => {
    // TODO render a button
    return "foo";
}