import type { FC } from 'react';

import type { SequenceStatus } from '../../pages/user/[username]/user';

export const SequencesReceived: FC<{ sequences: SequenceStatus[] }> = ({ sequences }) => {
    return (
        <div className='w-full overflow-x-auto'>
            {sequences.length !== 0 ? (
                <table className='table'>
                    <thead>
                        <tr>
                            <td>Sequence ID</td>
                            <td> Current status </td>
                        </tr>
                    </thead>
                    <tbody>
                        {sequences.map((row, index) => (
                            <tr key={index}>
                                <td>{row.sequenceId}</td>
                                <td> {row.status}</td>
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
