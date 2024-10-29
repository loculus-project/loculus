import { type FC } from 'react';
import { toast } from 'react-toastify';

import { DataUploadForm } from './DataUploadForm.tsx';
import { routes } from '../../routes/routes.ts';
import { type Group } from '../../types/backend.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

type RevisionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
};

export const RevisionForm: FC<RevisionFormProps> = ({
    accessToken,
    organism,
    clientConfig,
    group,
    referenceGenomeSequenceNames,
}) => {
    return (
        <div className='flex flex-col items-center'>
            <DataUploadForm
                accessToken={accessToken}
                organism={organism}
                referenceGenomeSequenceNames={referenceGenomeSequenceNames}
                clientConfig={clientConfig}
                action='revise'
                onError={(message) => toast.error(message, { position: 'top-center', autoClose: false })}
                group={group}
                onSuccess={() => {
                    window.location.href = routes.userSequenceReviewPage(organism, group.groupId);
                }}
            />
        </div>
    );
};
