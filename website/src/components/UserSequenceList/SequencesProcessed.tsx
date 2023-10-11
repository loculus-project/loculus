import type { FC, FormEvent } from 'react';

import { approveProcessedData } from './approveProcessedData';
import type { SequenceStatus } from '../../pages/user/[username]/user';
import type { SequenceVersion } from '../../types.ts';

type SequencesProcessedProps = { username: string; sequences: SequenceStatus[] };
export const SequencesProcessed: FC<SequencesProcessedProps> = ({ username, sequences }) => {
    const handleApprove = (username: string, sequenceVersion: SequenceVersion) => async (event: FormEvent) => {
        event.preventDefault();
        await approveProcessedData(username, [sequenceVersion]);
        window.location.reload();
    };
    return (
        <div className='w-full overflow-x-auto'>
            {sequences.length !== 0 ? (
                <table className='table'>
                    <thead>
                        <tr>
                            <td>SequenceID.Version</td>
                            <td>Current status</td>
                        </tr>
                    </thead>
                    <tbody>
                        {sequences.map((sequence, index) => (
                            <tr key={index}>
                                <td>
                                    {sequence.sequenceId}.{sequence.version}
                                </td>
                                <td> {sequence.status} </td>
                                <td>
                                    <button className='btn' onClick={handleApprove(username, sequence)}>
                                        Approve
                                    </button>
                                </td>
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
