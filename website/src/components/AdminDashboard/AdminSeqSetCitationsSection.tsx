import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { AddSeqSetCitationForm } from './AddSeqSetCitationForm';
import { AdminSeqSetCitationsTable } from './AdminSeqSetCitationsTable';
import { getErrorMessage } from '../../services/apiRequest';
import { backendApi } from '../../services/backendApi';
import type { ClientConfig } from '../../types/runtimeConfig';
import type { AdminSeqSetCitation } from '../../types/seqSetCitation';
import { displayConfirmationDialog } from '../ConfirmationDialog';

interface Props {
    citations: AdminSeqSetCitation[];
    clientConfig: ClientConfig;
    accessToken: string;
}

export const AdminSeqSetCitationsSection: FC<Props> = ({ citations, clientConfig, accessToken }) => {
    const [citationList, setCitationList] = useState(citations);

    const backend = backendApi(clientConfig.backendUrl, accessToken);

    const handleCitationAdded = (citation: AdminSeqSetCitation) => {
        setCitationList((current) => [
            citation,
            ...current.filter((c) => c.source.sourceDOI !== citation.source.sourceDOI),
        ]);
    };

    const deleteCitation = async (sourceDOI: string) => {
        try {
            await backend.deleteSeqSetCitation({ sourceDOI });
        } catch (error) {
            toast.error(`Failed to remove citation: ${getErrorMessage(error)}`, {
                position: 'top-center',
                autoClose: false,
            });
            return;
        }
        setCitationList((current) => current.filter((c) => c.source.sourceDOI !== sourceDOI));
        toast.success('Citation removed.', { position: 'top-center', autoClose: 3000 });
    };

    const handleDelete = (sourceDOI: string) => {
        const citation = citationList.find((c) => c.source.sourceDOI === sourceDOI);
        const citationLabel = citation?.source.title ?? sourceDOI;
        displayConfirmationDialog({
            dialogText: `Are you sure you want to remove the citation "${citationLabel}"?`,
            onConfirmation: () => deleteCitation(sourceDOI),
        });
    };

    return (
        <>
            <div className='overflow-x-auto'>
                <AdminSeqSetCitationsTable citations={citationList} onDelete={handleDelete} />
            </div>
            <AddSeqSetCitationForm
                clientConfig={clientConfig}
                accessToken={accessToken}
                onCitationAdded={handleCitationAdded}
            />
        </>
    );
};
