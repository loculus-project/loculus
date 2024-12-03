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
    // - Display which sequences will be edited. maybe reuse ActiveDownloadFilters?
    // - calculate the range of possible dates. I.e. from now until earliest date.
    // - think about what to do when we actually update.

    // stretch goals:
    // - maybe also show if sequences from multiple groups are selected? That might be unintentional?

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
