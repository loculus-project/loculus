import { type FC, useState } from 'react';

import { type SubmissionIdMapping, restrictedDataUseTermsType } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { DataUploadForm } from '../DataUploadForm.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';

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
                    <FormatResponseSequenceHeaders responseSequenceHeaders={responseSequenceHeaders} />
                ) : (
                    <div className='font-bold'>No data submitted yet</div>
                )}
            </div>
        </div>
    );
};
type FormatResponseSequenceHeadersProps = {
    responseSequenceHeaders: SubmissionIdMapping[];
};
const FormatResponseSequenceHeaders: FC<FormatResponseSequenceHeadersProps> = ({ responseSequenceHeaders }) => {
    return (
        <div className='p-6 space-y-6 w-full'>
            <h2 className='text-lg font-bold'>Response Sequence Headers</h2>
            <ul className='list-disc list-inside'>
                {responseSequenceHeaders.map((header) => (
                    <li key={header.accession}>
                        {getAccessionVersionString(header)}: {header.submissionId} ({header.dataUseTerms?.type}
                        {header.dataUseTerms?.type === restrictedDataUseTermsType
                            ? ` until: ${header.dataUseTerms.restrictedUntil}`
                            : ''}
                        )
                    </li>
                ))}
            </ul>
        </div>
    );
};
