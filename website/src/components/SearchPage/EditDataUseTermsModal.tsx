import { Dialog, DialogPanel, DialogTitle, Transition } from '@headlessui/react';
import { useState } from 'react';
import { BaseDialog } from './BaseDialog';

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
            <BaseDialog title='Edit data use terms' isOpen={isOpen} onClose={closeDialog}>
                <button onClick={closeDialog}>Close</button>
            </BaseDialog>
        </>
    );
}