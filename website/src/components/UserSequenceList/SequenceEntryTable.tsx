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
import { backendClientHooks } from '../../services/serviceHooks.ts';
import type { SequenceEntryStatus } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError.ts';
import { ConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../Submission/ManagedErrorFeedback.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type SequenceTableProps = {
    organism: string;
    accessToken: string;
    clientConfig: ClientConfig;
    sequenceEntries: SequenceEntryStatus[];
    bulkActionNames: BulkSequenceActionName[];
    singleActionNames: SingleSequenceActionName[];
};

const InnerSequenceEntryTable: FC<SequenceTableProps> = ({
    organism,
    accessToken,
    clientConfig,
    sequenceEntries,
    bulkActionNames,
    singleActionNames,
}) => {
    const [selectedSequenceEntryRowIds, setSelectedSequenceEntryRowIds] = useState<number[]>([]);

    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    const dialogRef = useRef<HTMLDialogElement>(null);
    const [dialogText, setDialogText] = useState('');
    const [dialogAction, setDialogAction] = useState<BulkSequenceAction>();

    const actionHooks = useActionHooks(organism, clientConfig, accessToken, openErrorFeedback);

    const handleOpenConfirmationDialog = (action: BulkSequenceAction) => {
        setDialogText(action.confirmationDialog?.message(getSelectedSequenceEntries) ?? '');
        setDialogAction(action);
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    const getSelectedSequenceEntries = useMemo(() => {
        return selectedSequenceEntryRowIds.map((sequenceIndex) => sequenceEntries[sequenceIndex]);
    }, [selectedSequenceEntryRowIds, sequenceEntries]);

    const singleActions = singleActionNames.map((name) => singleSequenceActions[name]);
    const bulkActions = bulkActionNames.map((name) => bulkSequenceActions[name]);

    const handleBulkAction = async (action: BulkSequenceAction) => {
        if (action.confirmationDialog !== undefined) {
            handleOpenConfirmationDialog(action);
        } else {
            await executeBulkAction(action);
        }
    };

    const handleSingleAction = async (sequenceStatus: SequenceEntryStatus, action: SingleSequenceAction) => {
        await action.actionOnSequenceEntry(organism, sequenceStatus);
    };

    const executeBulkAction = async (action: BulkSequenceAction) => {
        await action.actionOnSequenceEntries(getSelectedSequenceEntries, actionHooks);
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
                setSelectedSequenceEntryRowIds={setSelectedSequenceEntryRowIds}
                sequenceEntries={sequenceEntries}
                selectedSequenceEntryRowIds={selectedSequenceEntryRowIds}
                handleBulkAction={handleBulkAction}
            />
            <DisplayTable
                selectedSequenceEntryRowIds={selectedSequenceEntryRowIds}
                sequenceEntries={sequenceEntries}
                bulkActions={bulkActions}
                setSelectedSequenceEntryRowIds={setSelectedSequenceEntryRowIds}
                singleActions={singleActions}
                handleSingleAction={handleSingleAction}
            />
        </>
    );
};

export const SequenceEntryTable = withQueryProvider(InnerSequenceEntryTable);

const DisplayTable: FC<{
    selectedSequenceEntryRowIds: number[];
    setSelectedSequenceEntryRowIds: Dispatch<SetStateAction<number[]>>;
    sequenceEntries: SequenceEntryStatus[];
    bulkActions: BulkSequenceAction[];
    singleActions: SingleSequenceAction[];
    handleSingleAction: (sequenceStatus: SequenceEntryStatus, action: SingleSequenceAction) => void;
}> = ({
    selectedSequenceEntryRowIds,
    setSelectedSequenceEntryRowIds,
    sequenceEntries,
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
            const startIsSelected = selectedSequenceEntryRowIds.includes(selectionEnd);

            const start = Math.min(selectionStart, selectionEnd);
            const end = Math.max(selectionStart, selectionEnd);

            setSelectedSequenceEntryRowIds((prevSelected) => {
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
    }, [selectionStart, selectionEnd, selectedSequenceEntryRowIds, setSelectedSequenceEntryRowIds]);

    useEffect(() => {
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseUp]);

    return (
        <div className='w-full overflow-x-auto'>
            {sequenceEntries.length !== 0 ? (
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
                        {sequenceEntries.map((sequence, index) => (
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
                                            checked={selectedSequenceEntryRowIds.includes(index)}
                                            onChange={(event) => {
                                                event.preventDefault();
                                            }}
                                        />
                                    </td>
                                ) : null}
                                <td>{getAccessionVersionString(sequence)}</td>
                                <td> {sequence.status} </td>
                                {singleActions.map((action, index) => (
                                    <td key={index}>
                                        <button
                                            className='btn btn-xs normal-case btn-ghost'
                                            onClick={() => handleSingleAction(sequence, action)}
                                            data-testid={`${getAccessionVersionString(sequence)}.${action.name}`}
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
    selectedSequenceEntryRowIds: number[];
    setSelectedSequenceEntryRowIds: Dispatch<SetStateAction<number[]>>;
    sequenceEntries: SequenceEntryStatus[];
}> = ({
    bulkActions,
    handleBulkAction,
    selectedSequenceEntryRowIds,
    setSelectedSequenceEntryRowIds,
    sequenceEntries,
}) => {
    return (
        bulkActions.length > 0 && (
            <div className='flex flex-wrap justify-between items-end'>
                <div className='mb-3'>
                    <div className='pb-3'>
                        Selected {selectedSequenceEntryRowIds.length} of {sequenceEntries.length}
                    </div>
                    <button
                        disabled={selectedSequenceEntryRowIds.length === sequenceEntries.length}
                        className='btn btn-xs btn-ghost mr-3 normal-case'
                        onClick={(event) => {
                            event.preventDefault();
                            setSelectedSequenceEntryRowIds(sequenceEntries.map((_, index) => index));
                        }}
                    >
                        Select all
                    </button>

                    <button
                        disabled={selectedSequenceEntryRowIds.length === 0}
                        className='btn btn-xs btn-ghost mr-2 normal-case'
                        onClick={(event) => {
                            event.preventDefault();
                            setSelectedSequenceEntryRowIds([]);
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
                                disabled={selectedSequenceEntryRowIds.length === 0}
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

function useActionHooks(
    organism: string,
    clientConfig: ClientConfig,
    accessToken: string,
    openErrorFeedback: (message: string) => void,
) {
    const hooks = backendClientHooks(clientConfig);

    const useDeleteSequenceEntries = hooks.useDeleteSequences(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => window.location.reload(),
            onError: (error) => openErrorFeedback(deleteSequenceEntriesErrorMessage(error)),
        },
    );
    const useApproveProcessedData = hooks.useApproveProcessedData(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => window.location.reload(),
            onError: (error) => openErrorFeedback(approveProcessedDataErrorMessage(error)),
        },
    );
    const useRevokeSequenceEntries = hooks.useRevokeSequences(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => window.location.reload(),
            onError: (error) => openErrorFeedback(getRevokeSequenceEntriesErrorMessage(error)),
        },
    );
    const useConfirmRevocation = hooks.useConfirmRevocation(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => window.location.reload(),
            onError: (error) => openErrorFeedback(getConfirmRevocationErrorMessage(error)),
        },
    );

    return {
        deleteSequenceEntries: useDeleteSequenceEntries.mutate,
        approveProcessedData: useApproveProcessedData.mutate,
        revokeSequenceEntries: useRevokeSequenceEntries.mutate,
        confirmRevocation: useConfirmRevocation.mutate,
    };
}

function deleteSequenceEntriesErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'deleteSequences', error)) {
        return 'Failed to delete sequence entries: ' + error.response.data.detail;
    }
    return 'Failed to delete sequence entries: ' + stringifyMaybeAxiosError(error);
}

function approveProcessedDataErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'approveProcessedData', error)) {
        return 'Failed to approve processed sequence entries: ' + error.response.data.detail;
    }
    return 'Failed to approve processed sequence entries: ' + stringifyMaybeAxiosError(error);
}

function getRevokeSequenceEntriesErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'revokeSequences', error)) {
        return 'Failed to revoke sequence entries: ' + error.response.data.detail;
    }
    return 'Failed to revoke sequence entries: ' + stringifyMaybeAxiosError(error);
}

function getConfirmRevocationErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'confirmRevocation', error)) {
        return 'Failed to confirm revocation: ' + error.response.data.detail;
    }
    return 'Failed to confirm revocation: ' + stringifyMaybeAxiosError(error);
}
