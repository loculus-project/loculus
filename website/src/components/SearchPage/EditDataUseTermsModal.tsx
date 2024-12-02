import { Dialog, DialogPanel, DialogTitle, Transition } from '@headlessui/react';
import { useState } from 'react';

interface EditDataUseTermsModalProps {
    // take DownloadParameters
}

export const EditDataUseTermsModal: React.FC<EditDataUseTermsModalProps> = ({

}) => {
    const [isOpen, setIsOpen] = useState(false);
    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    return (
        <>
            <button className='mr-4 underline text-primary-700 hover:text-primary-500' onClick={openDialog}>
                Edit data use terms
            </button>
            <Dialog open={isOpen} onClose={closeDialog} className='relative z-40'>
                <div className='fixed inset-0 bg-black bg-opacity-25' />
                <div className='fixed inset-0 overflow-y-auto'>
                    <div className='flex min-h-full items-center justify-center p-4 text-center'>
                        <DialogPanel className='w-full max-w-5xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl'>
                            <DialogTitle as='h3' className='text-2xl font-bold leading-6 text-gray-900 mb-4'>Edit data use terms</DialogTitle>
                            <button
                                className='absolute right-2 top-2 text-gray-400 hover:text-gray-500'
                                onClick={closeDialog}
                            >
                                <span className='sr-only'>Close</span>
                                <svg className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        strokeWidth={2}
                                        d='M6 18L18 6M6 6l12 12'
                                    />
                                </svg>
                            </button>
                            <button onClick={closeDialog}>Close</button>

                        </DialogPanel>
                    </div>
                </div>
            </Dialog>
        </>
    );
}