import { useEffect, useState } from 'react';

import { BaseDialog } from './BaseDialog';
import { lapisClientHooks } from '../../services/serviceHooks';
import { DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD } from '../../settings';
import type { SequenceFilter } from './DownloadDialog/SequenceFilters';

interface EditDataUseTermsModalProps {
    lapisUrl: string;
    sequenceFilter: SequenceFilter;
}

export const EditDataUseTermsModal: React.FC<EditDataUseTermsModalProps> = ({ lapisUrl, sequenceFilter }) => {
    const [isOpen, setIsOpen] = useState(false);
    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const hooks = lapisClientHooks(lapisUrl).zodiosHooks;
    const detailsHook = hooks.useDetails({}, {});

    useEffect(() => {
        detailsHook.mutate({
            ...sequenceFilter.toApiParams(),
            fields: [DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD],
        });
    }, [detailsHook, sequenceFilter]);

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
                {detailsHook.isLoading ? 'loading' : ''}
                {detailsHook.error ? JSON.stringify(detailsHook.error) : ''}
                {detailsHook.data ? JSON.stringify(detailsHook.data) : ''}
                <button onClick={closeDialog}>Close</button>
            </BaseDialog>
        </>
    );
};
