import { type FC, useState } from 'react';

import { ManagedErrorFeedback, useErrorFeedbackState } from './ManagedErrorFeedback';
import type { SubmissionIdMapping } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { DataUploadForm } from '../DataUploadForm.tsx';

type SubmissionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
};

export const SubmissionForm: FC<SubmissionFormProps> = ({ accessToken, organism, clientConfig }) => {
    const [responseSequenceHeaders, setResponseSequenceHeaders] = useState<SubmissionIdMapping[] | null>(null);

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
                onSuccess={setResponseSequenceHeaders}
            />

            <div>
                {responseSequenceHeaders ? (
                    <div className='p-6 space-y-6 max-w-md w-full'>
                        <h2 className='text-lg font-bold'>Response Sequence Headers</h2>
                        <ul className='list-disc list-inside'>
                            {responseSequenceHeaders.map((header) => (
                                <li key={header.accession}>
                                    {getAccessionVersionString(header)}: {header.submissionId}
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
