import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { AddSeqSetCitationForm } from './AddSeqSetCitationForm';
import { AdminSeqSetCitationsTable } from './AdminSeqSetCitationsTable';
import { BackendClient } from '../../services/backendClient';
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

    const backendClient = new BackendClient(clientConfig.backendUrl);

    const handleCitationAdded = (citation: AdminSeqSetCitation) => {
        setCitationList((current) => [
            citation,
            ...current.filter((c) => c.source.sourceDOI !== citation.source.sourceDOI),
        ]);
    };

    const deleteCitation = async (sourceDOI: string) => {
        const result = await backendClient.deleteSeqSetCitation(accessToken, sourceDOI);
        result.match(
            () => {
                setCitationList((current) => current.filter((c) => c.source.sourceDOI !== sourceDOI));
                toast.success('Citation removed.', { position: 'top-center', autoClose: 3000 });
            },
            (error) => {
                toast.error(`Failed to remove citation. ${error.title}. ${error.detail}`, {
                    position: 'top-center',
                    autoClose: false,
                });
            },
        );
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
