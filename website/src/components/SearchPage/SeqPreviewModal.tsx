import { Dialog, Transition } from '@headlessui/react';
import React, { useEffect, useState } from 'react';

import { SequenceDataUI } from '../SequenceDetailsPage/SequenceDataUI';

interface SeqPreviewModalProps {
    seqId: string;
    accessToken?: string;
    isOpen: boolean;
    onClose: () => void;
}

export const SeqPreviewModal: React.FC<SeqPreviewModalProps> = ({ seqId, accessToken, isOpen, onClose }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<any | null>(null);

    useEffect(() => {
        if (seqId) {
            setIsLoading(true);
            void fetch(`/seq/${seqId}/details.json`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            })
                .then((res) => res.json())
                .then(setData)
                .finally(() => setIsLoading(false));
        }
    }, [accessToken, seqId]);

    return (
        <Transition appear show={isOpen}>
            <Dialog as='div' className='fixed inset-0 z-10 overflow-y-auto' onClose={onClose}>
                <div className='min-h-screen px-8 text-center'>
                    <Dialog.Overlay className='fixed inset-0 bg-black opacity-30' />

                    <span className='inline-block h-screen align-middle' aria-hidden='true'>
                        &#8203;
                    </span>

                    <div className='inline-block w-full p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl'>
                        <Dialog.Title as='h3' className='text-lg font-medium leading-6 text-gray-900'>
                            {seqId}
                        </Dialog.Title>

                        <div className='mt-4 text-gray-700 overflow-y-auto h-[calc(100vh-200px)]'>
                            {isLoading ? (
                                <div>Loading...</div>
                            ) : data !== null ? (
                                <div className=''>
                                    <SequenceDataUI {...data} />
                                </div>
                            ) : (
                                <div>Failed to load sequence data</div>
                            )}
                        </div>

                        <div className='mt-6'>
                            <button
                                type='button'
                                className='inline-flex justify-center px-4 py-2 text-sm font-medium text-blue-900 bg-blue-100 border border-transparent rounded-md hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500'
                                onClick={onClose}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};
