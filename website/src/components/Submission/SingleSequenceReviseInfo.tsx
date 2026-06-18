import { type FC } from 'react';

import { InputModeTabs } from './DataUploadForm.tsx';
import { routes } from '../../routes/routes.ts';

type SingleSequenceReviseInfoProps = {
    organism: string;
    groupId: number;
};

export const SingleSequenceReviseInfo: FC<SingleSequenceReviseInfoProps> = ({ organism, groupId }) => {
    return (
        <div className='text-left mt-3 max-w-4xl mb-3 w-full'>
            <div className='flex-col flex gap-8'>
                <h1 className='title'>Revise sequence</h1>
                <InputModeTabs action='revise' organism={organism} groupId={groupId} currentInputMode='form' />
                <div className='rounded border border-gray-200 bg-gray-50 p-6'>
                    <h2 className='font-medium text-lg mb-2'>Revising a single sequence entry</h2>
                    <p className='text-sm text-gray-700 mb-3'>
                        To revise an individual sequence entry, open the sequence's details page and use the{' '}
                        <span className='font-semibold'>Revise this sequence</span> button under{' '}
                        <span className='font-semibold'>Sequence management</span> near the bottom of the page. This
                        opens a form pre-filled with the current values so you can edit metadata and (optionally)
                        replace the sequence file.
                    </p>
                    <p className='text-sm text-gray-700 mb-4'>
                        You can browse and find your group's released sequences on the{' '}
                        <a
                            href={routes.mySequencesPage(organism, groupId)}
                            className='text-primary-600 hover:underline'
                        >
                            Released sequences
                        </a>{' '}
                        page.
                    </p>
                    <a
                        href={routes.mySequencesPage(organism, groupId)}
                        className='inline-block rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-500'
                    >
                        Browse released sequences
                    </a>
                </div>
                <p className='text-sm text-gray-500'>
                    Need to revise many sequences at once? Switch to the{' '}
                    <a href={routes.revisePage(organism, groupId, 'bulk')} className='text-primary-600 hover:underline'>
                        Upload bulk sequences
                    </a>{' '}
                    tab to upload a metadata file.
                </p>
            </div>
        </div>
    );
};
