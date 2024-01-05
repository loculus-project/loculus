import { type FC, useState } from 'react';

import type { ClientConfig, HeaderId } from '../../types';
import { DataUploadForm } from '../DataUploadForm.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';

type SubmissionFormProps = {
    clientConfig: ClientConfig;
};

export const SubmissionForm: FC<SubmissionFormProps> = ({ clientConfig }) => {
    const [responseSequenceHeaders, setResponseSequenceHeaders] = useState<HeaderId[] | null>(null);

    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    return (
        <div className='flex flex-col items-center'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <DataUploadForm
                targetUrl={`${clientConfig.backendUrl}/submit`}
                onError={openErrorFeedback}
                onSuccess={setResponseSequenceHeaders}
            />

            <div>
                {responseSequenceHeaders ? (
                    <div className='p-6 space-y-6 max-w-md w-full'>
                        <h2 className='text-lg font-bold'>Response Sequence Headers</h2>
                        <ul className='list-disc list-inside'>
                            {responseSequenceHeaders.map((header) => (
                                <li key={header.sequenceId}>
                                    {header.sequenceId}.{header.version}: {header.customId}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <div className='font-bold'>No data submitted yet</div>
                )}
            </div>
        </div>
    );
};
