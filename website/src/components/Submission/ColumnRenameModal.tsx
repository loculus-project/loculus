import type React from "react";
import { useEffect, useState } from "react";
import * as XLSX from 'xlsx';

import { BaseDialog } from "../common/BaseDialog";

type ColumnRenameModalProps = {
    inputFile: File,
    setInputFile: (inputFile: File) => void;
    possibleTargetColumns: string[],
}

type IsLoading = {
    type: "loading";
  };
  
  type Loaded = {
    type: "loaded";
    sourceColumns: string[];
  };
  
  type LoadingError = {
    type: "error";
    error: any;
  };

type ModalState = IsLoading | Loaded | LoadingError


export const ColumnRenameModal: React.FC<ColumnRenameModalProps> = ({
    inputFile, setInputFile, possibleTargetColumns
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const [modalState, setModalState] = useState<ModalState>({type: 'loading'});

    useEffect(() => {
        console.log("fooooo")
        if (!isOpen) return;

        console.log("in use effect")

        const loadFile = async () => {
            setModalState({type: 'loading'});
            await new Promise(resolve => setTimeout(resolve, 5000));  // sleep 2 secs
            try {
                console.log("reading file")
                const arrayBuffer = await inputFile.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: "array" });
                console.log("file read")

                const firstSheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheetName];

                // Get the first row of the sheet (headers)
                const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                const headers= sheetData[0] as string[];

                // You can update this logic to rename columns or perform other operations
                setModalState({ type:'loaded', sourceColumns: headers });
            } catch (error) {
                console.error("Error loading or processing the file", error);
                setModalState({ type: 'error', error });
            }
        };

        loadFile();

    }, [isOpen, inputFile])

    let content;
    if (modalState.type === "error") {
      content = <p>Error loading file: {modalState.error.message}</p>;
    } else if (modalState.type === "loaded") {
      content = (
        <div>
          <p>Column Headers:</p>
          <ul>
            {modalState.sourceColumns.map((header, index) => (
              <li key={index}>{header}</li>
            ))}
          </ul>
        </div>
      );
    } else {
      content = <p>Loading...</p>; // Default loading state
    }
    
    return (
        <>
            <button className='mr-4 underline text-primary-700 hover:text-primary-500' onClick={(e) => {
                e.preventDefault();
                openDialog();
            }}>
                Edit columns
            </button>
            <BaseDialog title='Edit column mapping' isOpen={isOpen} onClose={closeDialog}>
                {content}
            </BaseDialog>
        </>
    );
}