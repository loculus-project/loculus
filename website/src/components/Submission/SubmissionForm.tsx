import { type FC } from 'react';

import { DataUploadForm } from './DataUploadForm.tsx';
import { routes } from '../../routes/routes.ts';
import { type Group } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';

type SubmissionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
};

export const SubmissionForm: FC<SubmissionFormProps> = ({ accessToken, organism, clientConfig, group }) => {
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
                group={group}
                onSuccess={() => {
                    window.location.href = routes.userSequenceReviewPage(organism, group.groupId);
                }}
            />
        </div>
    );
};
