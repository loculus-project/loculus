import { type FC } from 'react';

import { routes } from '../../routes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { DataUploadForm } from '../Submission/DataUploadForm.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';

type RevisionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    groupsOfUser: object[];
};

export const RevisionForm: FC<RevisionFormProps> = ({ accessToken, organism, clientConfig }) => {
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback, groupsOfUser } = useErrorFeedbackState();

    return (
        <div className='flex flex-col items-center'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <DataUploadForm
                accessToken={accessToken}
                organism={organism}
                clientConfig={clientConfig}
                action='revise'
                onError={openErrorFeedback}
                groupsOfUser={groupsOfUser}
                onSuccess={() => {
                    window.location.href = routes.userSequenceReviewPage(organism);
                }}
            />
        </div>
    );
};
