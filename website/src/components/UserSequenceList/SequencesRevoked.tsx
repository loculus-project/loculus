import { type FC, useCallback, useEffect, useState } from 'react';

import { confirmRevokedData } from './revokeReadyData';
import type { SequenceStatus } from '../../pages/user/[username]/user';
import type { ClientConfig } from '../../types.ts';

type SequencesReadyProps = { clientConfig: ClientConfig; username: string; sequences: SequenceStatus[] };

export const SequencesRevoked: FC<SequencesReadyProps> = ({ clientConfig, sequences }) => {
    const [selectedSequences, setSelectedSequences] = useState<number[]>([]);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState<number | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

    const handleMouseDown = (sequenceId: number) => {
        setIsSelecting(true);
        setSelectionStart(sequenceId);
        setSelectionEnd(sequenceId);
    };

    const handleMouseMove = (sequenceId: number) => {
        if (isSelecting) {
            setSelectionEnd(sequenceId);
        }
    };

    const handleMouseUp = useCallback(() => {
        setIsSelecting(false);

        if (selectionStart !== null && selectionEnd !== null) {
            const start = Math.min(selectionStart, selectionEnd);
            const end = Math.max(selectionStart, selectionEnd);

            const selected = sequences
                .filter((sequence) => sequence.sequenceId >= start && sequence.sequenceId <= end)
                .map((sequence) => sequence.sequenceId);

            setSelectedSequences((prevSelected) => {
                const newSelected = new Set(prevSelected);

                selected.forEach((sequenceId) => {
                    if (newSelected.has(sequenceId)) {
                        newSelected.delete(sequenceId);
                    } else {
                        newSelected.add(sequenceId);
                    }
                });

                return Array.from(newSelected);
            });

            setSelectionStart(null);
            setSelectionEnd(null);
        }
    }, [selectionStart, selectionEnd, sequences]);

    useEffect(() => {
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseUp]);

    const handleConfirm = async () => {
        if (selectedSequences.length > 0) {
            await confirmRevokedData(selectedSequences, clientConfig);
            window.location.reload();
        }
    };

    return (
        <>
            <div>
                <button className='btn' onClick={handleConfirm}>
                    Confirm Revocation
                </button>
            </div>
            <div className='w-full overflow-x-auto'>
                {sequences.length !== 0 ? (
                    <div>
                        <table className='table'>
                            <thead>
                                <tr>
                                    <td>SequenceID.Version</td>
                                    <td>Current status</td>
                                </tr>
                            </thead>
                            <tbody>
                                {sequences.map((sequence, index) => (
                                    <tr
                                        key={index}
                                        onMouseDown={() => handleMouseDown(sequence.sequenceId)}
                                        onMouseMove={() => handleMouseMove(sequence.sequenceId)}
                                        style={{
                                            background:
                                                isSelecting &&
                                                selectionStart !== null &&
                                                selectionEnd !== null &&
                                                sequence.sequenceId >= Math.min(selectionStart, selectionEnd) &&
                                                sequence.sequenceId <= Math.max(selectionStart, selectionEnd)
                                                    ? '#a5c4c8'
                                                    : 'none',
                                            userSelect: isSelecting ? 'none' : 'auto',
                                        }}
                                    >
                                        <td>
                                            <input
                                                type='checkbox'
                                                checked={selectedSequences.includes(sequence.sequenceId)}
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
                                ))}
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
