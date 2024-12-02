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
                            <button onClick={closeDialog}>Close</button>

                        </DialogPanel>
                    </div>
                </div>
            </Dialog>
        </>
    );
}