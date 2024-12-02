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

    // TODO
    // - Get as input: which sequences are currently filterd on? We can re-use DownloadParamters
    // - From the API: Fetch the data use terms that are part of the selection
    // - display them maybe, so the user nows what's going on
    // - maybe also show if sequences from multiple groups are selected? That might be unintentional?
    // - calculate which range of new data use terms are possible and show an update form based on that

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