import { type FC } from 'react';

import { routes } from '../../routes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { DataUploadForm } from '../DataUploadForm.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';

type SubmissionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
};

export const SubmissionForm: FC<SubmissionFormProps> = ({ accessToken, organism, clientConfig, groupsOfUser }) => {
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    return (
        <div className='flex flex-col items-center'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <DataUploadForm
                accessToken={accessToken}
                organism={organism}
                clientConfig={clientConfig}
                action='submit'
                onError={openErrorFeedback}
                groupsOfUser={groupsOfUser}
                onSuccess={() => {
                    window.location.href = routes.userSequenceReviewPage(organism);
                }}
            />
        </div>
    );
};
