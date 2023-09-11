import { type FC, useState } from 'react';

import type { Config } from '../../types';
import { DataUploadForm } from '../DataUploadForm.tsx';
import { ManagedErrorFeedback } from '../Submission/ManagedErrorFeedback';

type RevisionFormProps = {
    config: Config;
};

type RevisionResult = {
    sequenceId: number;
    version: number;
    genericErrors: string[];
};

export const RevisionForm: FC<RevisionFormProps> = ({ config }) => {
    const [responseSequenceHeaders, setResponseSequenceHeaders] = useState<RevisionResult[] | null>(null);

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
                targetUrl={`${config.backendUrl}/revise`}
                onError={handleOpenError}
                onSuccess={setResponseSequenceHeaders}
            />

            <div>
                {responseSequenceHeaders ? (
                    <div className='p-6 space-y-6 w-full'>
                        <h2 className='text-lg font-bold'>Result of Revision</h2>
                        <ul className='list-disc list-inside'>
                            {responseSequenceHeaders.map((header) =>
                                header.genericErrors.length === 0 ? (
                                    <li key={header.sequenceId}>
                                        Sequence {header.sequenceId} successful revised; new version is {header.version}
                                    </li>
                                ) : (
                                    <li key={header.sequenceId}>
                                        Sequence {header.sequenceId} failed to revise: {header.genericErrors.join(', ')}
                                    </li>
                                ),
                            )}
                        </ul>
                    </div>
                ) : (
                    <div className='font-bold'>No data submitted yet</div>
                )}
            </div>
        </div>
    );
};
