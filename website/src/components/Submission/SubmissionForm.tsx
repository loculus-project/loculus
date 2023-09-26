import { type FC, useState } from 'react';

import { ManagedErrorFeedback } from './ManagedErrorFeedback';
import type { HeaderId, RuntimeConfig } from '../../types';
import { DataUploadForm } from '../DataUploadForm.tsx';

type SubmissionFormProps = {
    runtimeConfig: RuntimeConfig;
};

export const SubmissionForm: FC<SubmissionFormProps> = ({ runtimeConfig }) => {
    const [responseSequenceHeaders, setResponseSequenceHeaders] = useState<HeaderId[] | null>(null);

    const [isErrorOpen, setIsErrorOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleOpenError = (message: string) => {
        setErrorMessage(message);
        setIsErrorOpen(true);
    };

    const handleCloseError = () => {
        setErrorMessage('');
        setIsErrorOpen(false);
    };

    return (
        <div className='flex flex-col items-center'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={handleCloseError} />
            <DataUploadForm
                targetUrl={`${runtimeConfig.backendUrl}/submit`}
                onError={handleOpenError}
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
