import React, { useEffect, useState } from 'react';

import { BaseDialog } from '../common/BaseDialog';

type ColumnRenameModalProps = {
    inputFile: File; // expects a TSV file
    setInputFile: (inputFile: File) => void;
    possibleTargetColumns: string[];
};

type IsLoading = {
    type: 'loading';
};

type Loaded = {
    type: 'loaded';
    sourceColumns: string[];
};

type LoadingError = {
    type: 'error';
    error: any;
};

type ModalState = IsLoading | Loaded | LoadingError;

export const ColumnRenameModal: React.FC<ColumnRenameModalProps> = ({ inputFile, possibleTargetColumns }) => {
    const [isOpen, setIsOpen] = useState(false);
    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const [modalState, setModalState] = useState<ModalState>({ type: 'loading' });

    useEffect(() => {
        if (!isOpen) return;

        const loadFile = async () => {
            setModalState({ type: 'loading' });
            await new Promise((resolve) => setTimeout(resolve, 5000)); // sleep 2 secs
            try {
                const textContent = await inputFile.text();
                const rows = textContent.split('\n').map((row) => row.split('\t'));
                setModalState({ type: 'loaded', sourceColumns: rows[0] });
            } catch (error) {
                setModalState({ type: 'error', error });
            }
        };

        void loadFile();
    }, [isOpen, inputFile]);

    let content;
    if (modalState.type === 'error') {
        content = <p>Error loading file: {modalState.error.message}</p>;
    } else if (modalState.type === 'loaded') {
        content = (
            <div>
                <table className='table-auto border-collapse border border-gray-200'>
                    <thead>
                        <tr>
                            <th className='border border-gray-300 px-4 py-2'>Metadata column</th>
                            <th className='border border-gray-300 px-4 py-2'>File column</th>
                        </tr>
                    </thead>
                    <tbody>
                        {possibleTargetColumns.map((targetColumn, index) => (
                            <tr key={index}>
                                <td className='border border-gray-300 px-4 py-2'>{targetColumn}</td>
                                <td className='border border-gray-300 px-4 py-2'>
                                    <select className='border border-gray-300 px-2 py-1 rounded'>
                                        <option value=''>Select a column</option>
                                        {modalState.sourceColumns.map((sourceColumn, idx) => (
                                            <option key={idx} value={sourceColumn}>
                                                {sourceColumn}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    } else {
        content = <p>Loading...</p>; // Default loading state
    }

    return (
        <>
            <button
                className='mr-4 underline text-primary-700 hover:text-primary-500'
                onClick={(e) => {
                    e.preventDefault();
                    openDialog();
                }}
            >
                Edit columns
            </button>
            <BaseDialog title='Edit column mapping' isOpen={isOpen} onClose={closeDialog}>
                {content}
            </BaseDialog>
        </>
    );
};
