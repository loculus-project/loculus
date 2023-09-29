import type { FC } from 'react';

import type { SequenceStatus } from '../../pages/user/[username]/user';

interface SequenceWithReviewProps {
    sequences: SequenceStatus[];
    username: string;
}
export const SequencesWithReview: FC<SequenceWithReviewProps> = ({ sequences, username }) => {
    return (
        <div className='w-full overflow-x-auto'>
            {sequences.length !== 0 ? (
                <table className='table' aria-label='list-of-sequences-to-review'>
                    <thead>
                        <tr>
                            <td>SequenceID.Version</td>
                            <td>Current status</td>
                            <td>Link to Review</td>
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
                                    <a
                                        href={`/user/${username}/sequences/${sequence.sequenceId}`}
                                        className='hover:underline'
                                    >
                                        Click to view
                                    </a>
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
