import { type FC, useCallback, useEffect, useState } from 'react';

import { revokeReadyData } from './revokeReadyData';
import type { SequenceStatus } from '../../pages/user/[username]/user';
import type { ClientConfig } from '../../types.ts';

type SequencesReadyProps = { clientConfig: ClientConfig; sequences: SequenceStatus[] };

type SequenceWithRowId = SequenceStatus & { rowId: number };

export const SequencesReady: FC<SequencesReadyProps> = ({ clientConfig, sequences }) => {
    const [selectedSequences, setSelectedSequences] = useState<number[]>([]);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState<number | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

    const [sequencesWithRowId] = useState<SequenceWithRowId[]>(
        sequences.map((sequence, index) => ({ ...sequence, rowId: index })),
    );

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
            const startIsSelected = selectedSequences.includes(selectionStart);

            const start = Math.min(selectionStart, selectionEnd);
            const end = Math.max(selectionStart, selectionEnd);

            const selected = sequencesWithRowId
                .filter((sequence) => sequence.rowId >= start && sequence.rowId <= end)
                .map((sequence) => sequence.rowId);

            setSelectedSequences((prevSelected) => {
                const newSelected = new Set(prevSelected);

                selected.forEach((id) => {
                    // this is the logic for setting the same as the start
                    if (startIsSelected && newSelected.has(id)) {
                        newSelected.delete(id);
                    } else if (!startIsSelected && !newSelected.has(id)) {
                        newSelected.add(id);
                    }
                    // this is the logic for toggling
                    // if (newSelected.has(id)) {
                    //     newSelected.delete(id);
                    // } else {
                    //     newSelected.add(id);
                    // }
                });

                return Array.from(newSelected);
            });

            setSelectionStart(null);
            setSelectionEnd(null);
        }
    }, [selectionStart, selectionEnd, selectedSequences, sequencesWithRowId]);

    useEffect(() => {
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseUp]);

    const handleRevoke = async () => {
        if (selectedSequences.length > 0) {
            await revokeReadyData(
                selectedSequences.map(
                    // eslint-disable-next-line
                    (sequence) => sequencesWithRowId.find((seq) => seq.rowId === sequence)?.sequenceId || 0,
                ),
                clientConfig,
            );
            window.location.reload();
        }
    };

    return (
        <>
            <div>
                <button className='btn' onClick={handleRevoke}>
                    Revoke
                </button>
            </div>
            <div className='w-full overflow-x-auto'>
                {sequencesWithRowId.length !== 0 ? (
                    <div>
                        <table className='table'>
                            <thead>
                                <tr>
                                    <td />
                                    <td>SequenceID.Version</td>
                                    <td>Current status</td>
                                </tr>
                            </thead>
                            <tbody>
                                {sequencesWithRowId.map((sequence, index) => {
                                    return (
                                        <tr
                                            key={index}
                                            onMouseDown={() => handleMouseDown(sequence.rowId)}
                                            onMouseMove={() => handleMouseMove(sequence.rowId)}
                                            style={{
                                                background:
                                                    isSelecting &&
                                                    selectionStart !== null &&
                                                    selectionEnd !== null &&
                                                    sequence.rowId >= Math.min(selectionStart, selectionEnd) &&
                                                    sequence.rowId <= Math.max(selectionStart, selectionEnd)
                                                        ? '#a5c4c8'
                                                        : 'none',
                                                userSelect: isSelecting ? 'none' : 'auto',
                                            }}
                                        >
                                            <td>
                                                <input
                                                    type='checkbox'
                                                    checked={selectedSequences.includes(sequence.rowId)}
                                                    onChange={(event) => {
                                                        event.preventDefault();
                                                    }}
                                                />
                                            </td>
                                            <td>
                                                {sequence.sequenceId}.{sequence.version}
                                            </td>
                                            <td> {sequence.status} </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className='flex justify-center font-bold text-xl mb-5'>No Data</div>
                )}
            </div>
        </>
    );
};
