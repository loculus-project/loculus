import { isErrorFromAlias } from '@zodios/core';
import type { AxiosError } from 'axios';
import { sentenceCase } from 'change-case';
import { type Dispatch, type FC, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    type BulkSequenceAction,
    type BulkSequenceActionName,
    bulkSequenceActions,
    type SingleSequenceAction,
    type SingleSequenceActionName,
    singleSequenceActions,
} from './sequenceActions.ts';
import { backendApi } from '../../services/backendApi.ts';
import { backendClientHooks } from '../../services/backendHooks.ts';
import type { ClientConfig, SequenceStatus } from '../../types.ts';
import { getSequenceVersionString } from '../../utils/extractSequenceVersion.ts';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError.ts';
import { ConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../Submission/ManagedErrorFeedback.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type SequenceTableProps = {
    username: string;
    clientConfig: ClientConfig;
    sequences: SequenceStatus[];
    bulkActionNames: BulkSequenceActionName[];
    singleActionNames: SingleSequenceActionName[];
};

const InnerSequenceTable: FC<SequenceTableProps> = ({
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

    const actionHooks = useActionHooks(clientConfig, username, openErrorFeedback);

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
        await action.actionOnSequence(sequenceStatus, username);
    };

    const executeBulkAction = async (action: BulkSequenceAction) => {
        await action.actionOnSequences(getSelectedSequences, actionHooks);
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

export const SequenceTable = withQueryProvider(InnerSequenceTable);

const DisplayTable: FC<{
    selectedSequenceRowIds: number[];
    setSelectedSequenceRowIds: Dispatch<SetStateAction<number[]>>;
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
    setSelectedSequenceRowIds: Dispatch<SetStateAction<number[]>>;
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

export type ActionHooks = ReturnType<typeof useActionHooks>;

function useActionHooks(clientConfig: ClientConfig, username: string, openErrorFeedback: (message: string) => void) {
    const hooks = backendClientHooks(clientConfig);

    const useDeleteSequences = hooks.useDeleteSequences(
        { queries: { username } },
        {
            onSuccess: () => window.location.reload(),
            onError: (error) => openErrorFeedback(deleteSequencesErrorMessage(error)),
        },
    );
    const useApproveProcessedData = hooks.useApproveProcessedData(
        { queries: { username } },
        {
            onSuccess: () => window.location.reload(),
            onError: (error) => openErrorFeedback(approveProcessedDataErrorMessage(error)),
        },
    );
    const useRevokeSequences = hooks.useRevokeSequences(
        { queries: { username } },
        {
            onSuccess: () => window.location.reload(),
            onError: (error) => openErrorFeedback(getRevokeSequencesErrorMessage(error)),
        },
    );
    const useConfirmRevocation = hooks.useConfirmRevocation(
        { queries: { username } },
        {
            onSuccess: () => window.location.reload(),
            onError: (error) => openErrorFeedback(getConfirmRevocationErrorMessage(error)),
        },
    );

    return {
        deleteSequences: useDeleteSequences.mutate,
        approveProcessedData: useApproveProcessedData.mutate,
        revokeSequences: useRevokeSequences.mutate,
        confirmRevocation: useConfirmRevocation.mutate,
    };
}

function deleteSequencesErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'deleteSequences', error)) {
        return 'Failed to delete sequences: ' + error.response.data.detail;
    }
    return 'Failed to delete sequences: ' + stringifyMaybeAxiosError(error);
}

function approveProcessedDataErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'approveProcessedData', error)) {
        return 'Failed to approve processed sequences: ' + error.response.data.detail;
    }
    return 'Failed to approve processed sequences: ' + stringifyMaybeAxiosError(error);
}

function getRevokeSequencesErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'revokeSequences', error)) {
        return 'Failed to revoke sequences: ' + error.response.data.detail;
    }
    return 'Failed to revoke sequences: ' + stringifyMaybeAxiosError(error);
}

function getConfirmRevocationErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'confirmRevocation', error)) {
        return 'Failed to confirm revocation: ' + error.response.data.detail;
    }
    return 'Failed to confirm revocation: ' + stringifyMaybeAxiosError(error);
}
