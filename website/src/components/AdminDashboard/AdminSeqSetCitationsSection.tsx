import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { AddSeqSetCitationForm } from './AddSeqSetCitationForm';
import { AdminSeqSetCitationsTable } from './AdminSeqSetCitationsTable';
import { BackendClient } from '../../services/backendClient';
import type { ClientConfig } from '../../types/runtimeConfig';
import type { AdminSeqSetCitation } from '../../types/seqSetCitation';

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

    const handleDelete = async (sourceDOI: string) => {
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

    return (
        <>
            <AddSeqSetCitationForm
                clientConfig={clientConfig}
                accessToken={accessToken}
                onCitationAdded={handleCitationAdded}
            />
            <div className='overflow-x-auto'>
                <AdminSeqSetCitationsTable
                    citations={citationList}
                    // eslint-disable-next-line @typescript-eslint/no-misused-promises
                    onDelete={handleDelete}
                />
            </div>
        </>
    );
};
