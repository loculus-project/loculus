import { sentenceCase } from 'change-case';
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    type BulkSequenceAction,
    type BulkSequenceActionName,
    bulkSequenceActions,
    type SingleSequenceAction,
    type SingleSequenceActionName,
    singleSequenceActions,
} from './sequenceActions.ts';
import type { ClientConfig, SequenceStatus } from '../../types.ts';
import { getSequenceVersionString } from '../../utils/extractSequenceVersion.ts';
import { ConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../Submission/ManagedErrorFeedback.tsx';

type SequenceTableProps = {
    username: string;
    clientConfig: ClientConfig;
    sequences: SequenceStatus[];
    bulkActionNames: BulkSequenceActionName[];
    singleActionNames: SingleSequenceActionName[];
};

export const SequenceTable: FC<SequenceTableProps> = ({
    username,
    clientConfig,
    sequences,
    bulkActionNames,
    singleActionNames,
}) => {
    const [selectedSequenceRowIds, setSelectedSequenceRowIds] = useState<number[]>([]);

    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    const dialogRef = useRef<HTMLDialogElement>(null);
    const [dialogText, setDialogText] = useState('');
    const [dialogAction, setDialogAction] = useState<BulkSequenceAction>();

    const handleOpenConfirmationDialog = (action: BulkSequenceAction) => {
        setDialogText(action.confirmationDialog?.message(getSelectedSequences) ?? '');
        setDialogAction(action);
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    const getSelectedSequences = useMemo(() => {
        return selectedSequenceRowIds.map((sequenceIndex) => sequences[sequenceIndex]);
    }, [selectedSequenceRowIds, sequences]);

    const singleActions = singleActionNames.map((name) => singleSequenceActions[name]);
    const bulkActions = bulkActionNames.map((name) => bulkSequenceActions[name]);

    const handleBulkAction = async (action: BulkSequenceAction) => {
        if (action.confirmationDialog !== undefined) {
            handleOpenConfirmationDialog(action);
        } else {
            await executeBulkAction(action);
        }
    };

    const handleSingleAction = async (sequenceStatus: SequenceStatus, action: SingleSequenceAction) => {
        const result = await action.actionOnSequence(sequenceStatus, clientConfig, username);
        if (result.isErr()) {
            openErrorFeedback(result.error);
        }
    };

    const executeBulkAction = async (action: BulkSequenceAction) => {
        const result = await action.actionOnSequences(getSelectedSequences, clientConfig, username);

        if (result.isErr()) {
            openErrorFeedback(result.error);
        } else {
            window.location.reload();
        }
    };

    return (
        <>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <dialog ref={dialogRef} className='modal'>
                <ConfirmationDialog
                    onConfirmation={() => (dialogAction ? executeBulkAction(dialogAction) : null)}
                    dialogText={dialogText}
                />
            </dialog>
            <DisplayBulkActions
                bulkActions={bulkActions}
                setSelectedSequenceRowIds={setSelectedSequenceRowIds}
                sequences={sequences}
                selectedSequenceRowIds={selectedSequenceRowIds}
                handleBulkAction={handleBulkAction}
            />
            <DisplayTable
                selectedSequenceRowIds={selectedSequenceRowIds}
                sequences={sequences}
                bulkActions={bulkActions}
                setSelectedSequenceRowIds={setSelectedSequenceRowIds}
                singleActions={singleActions}
                handleSingleAction={handleSingleAction}
            />
        </>
    );
};

const DisplayTable: FC<{
    selectedSequenceRowIds: number[];
    setSelectedSequenceRowIds: React.Dispatch<React.SetStateAction<number[]>>;
    sequences: SequenceStatus[];
    bulkActions: BulkSequenceAction[];
    singleActions: SingleSequenceAction[];
    handleSingleAction: (sequenceStatus: SequenceStatus, action: SingleSequenceAction) => void;
}> = ({
    selectedSequenceRowIds,
    setSelectedSequenceRowIds,
    sequences,
    bulkActions,
    singleActions,
    handleSingleAction,
}) => {
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState<number | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

    const handleMouseDown = (rowId: number) => {
        setIsSelecting(true);
        setSelectionStart(rowId);
        setSelectionEnd(rowId);
    };

    const handleMouseMove = (rowId: number) => {
        if (isSelecting) {
            setSelectionEnd(rowId);
        }
    };

    const handleMouseUp = useCallback(() => {
        setIsSelecting(false);

        if (selectionStart !== null && selectionEnd !== null) {
            const startIsSelected = selectedSequenceRowIds.includes(selectionEnd);

            const start = Math.min(selectionStart, selectionEnd);
            const end = Math.max(selectionStart, selectionEnd);

            setSelectedSequenceRowIds((prevSelected) => {
                const newSelected = new Set(prevSelected);

                for (let id = start; id <= end; id++) {
                    if (startIsSelected && newSelected.has(id)) {
                        newSelected.delete(id);
                    } else if (!startIsSelected && !newSelected.has(id)) {
                        newSelected.add(id);
                    }
                }

                return Array.from(newSelected);
            });

            setSelectionStart(null);
            setSelectionEnd(null);
        }
    }, [selectionStart, selectionEnd, selectedSequenceRowIds, setSelectedSequenceRowIds]);

    useEffect(() => {
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseUp]);

    return (
        <div className='w-full overflow-x-auto'>
            {sequences.length !== 0 ? (
                <table className='table '>
                    <thead>
                        <tr>
                            {bulkActions.length > 0 && <td></td>}
                            <td>ID.Version</td>
                            <td>Current Status</td>
                            {singleActions.map((action, index) => (
                                <td key={index}>{action.tableHeader}</td>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sequences.map((sequence, index) => (
                            <tr
                                key={index}
                                onMouseDown={bulkActions.length > 0 ? () => handleMouseDown(index) : undefined}
                                onMouseMove={bulkActions.length > 0 ? () => handleMouseMove(index) : undefined}
                                style={{
                                    background:
                                        isSelecting &&
                                        selectionStart !== null &&
                                        selectionEnd !== null &&
                                        index >= Math.min(selectionStart, selectionEnd) &&
                                        index <= Math.max(selectionStart, selectionEnd)
                                            ? '#a5c4c8'
                                            : 'none',
                                    userSelect: isSelecting ? 'none' : 'auto',
                                }}
                            >
                                {bulkActions.length > 0 ? (
                                    <td>
                                        <input
                                            type='checkbox'
                                            checked={selectedSequenceRowIds.includes(index)}
                                            onChange={(event) => {
                                                event.preventDefault();
                                            }}
                                        />
                                    </td>
                                ) : null}
                                <td>{getSequenceVersionString(sequence)}</td>
                                <td> {sequence.status} </td>
                                {singleActions.map((action, index) => (
                                    <td key={index}>
                                        <button
                                            className='btn btn-xs normal-case btn-ghost'
                                            onClick={() => handleSingleAction(sequence, action)}
                                        >
                                            {sentenceCase(action.name)}
                                        </button>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className='flex justify-center font-bold text-xl mb-5'>No Data</div>
            )}
        </div>
    );
};

const DisplayBulkActions: FC<{
    bulkActions: BulkSequenceAction[];
    handleBulkAction: (action: BulkSequenceAction) => void;
    selectedSequenceRowIds: number[];
    setSelectedSequenceRowIds: React.Dispatch<React.SetStateAction<number[]>>;
    sequences: SequenceStatus[];
}> = ({ bulkActions, handleBulkAction, selectedSequenceRowIds, setSelectedSequenceRowIds, sequences }) => {
    return (
        bulkActions.length > 0 && (
            <div className='flex flex-wrap justify-between items-end'>
                <div className='mb-3'>
                    <div className='pb-3'>
                        Selected {selectedSequenceRowIds.length} of {sequences.length}
                    </div>
                    <button
                        disabled={selectedSequenceRowIds.length === sequences.length}
                        className='btn btn-xs btn-ghost mr-3 normal-case'
                        onClick={(event) => {
                            event.preventDefault();
                            setSelectedSequenceRowIds(sequences.map((_, index) => index));
                        }}
                    >
                        Select all
                    </button>

                    <button
                        disabled={selectedSequenceRowIds.length === 0}
                        className='btn btn-xs btn-ghost mr-2 normal-case'
                        onClick={(event) => {
                            event.preventDefault();
                            setSelectedSequenceRowIds([]);
                        }}
                    >
                        Clear all
                    </button>
                </div>
                <div className='flex items-center gap-3 mb-3'>
                    {bulkActions.map((action, index) => (
                        <div key={index} className=''>
                            <button
                                className='btn btn-active btn-sm normal-case'
                                onClick={() => handleBulkAction(action)}
                                disabled={selectedSequenceRowIds.length === 0}
                            >
                                {sentenceCase(action.name)}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )
    );
};
