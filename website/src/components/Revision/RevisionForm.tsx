import { type FC, useState } from 'react';

import type { ClientConfig, HeaderId } from '../../types';
import { DataUploadForm } from '../DataUploadForm.tsx';
import { ManagedErrorFeedback } from '../common/ManagedErrorFeedback';

type RevisionFormProps = {
    clientConfig: ClientConfig;
};

export const RevisionForm: FC<RevisionFormProps> = ({ clientConfig }) => {
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
                targetUrl={`${clientConfig.backendUrl}/revise`}
                onError={handleOpenError}
                onSuccess={setResponseSequenceHeaders}
            />

            <div>
                {responseSequenceHeaders ? (
                    <div className='p-6 space-y-6 w-full'>
                        <h2 className='text-lg font-bold'>Result of Revision</h2>
                        <ul className='list-disc list-inside'>
                            {responseSequenceHeaders.map((header) => (
                                <li key={header.sequenceId}>
                                    Sequence {header.sequenceId} successful revised; new version is {header.version}
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
