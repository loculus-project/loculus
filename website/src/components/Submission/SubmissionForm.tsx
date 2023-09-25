import { type FC, useState } from 'react';

import { ManagedErrorFeedback } from './ManagedErrorFeedback';
import type { Config, HeaderId } from '../../types';
import { DataUploadForm } from '../DataUploadForm.tsx';

type SubmissionFormProps = {
    config: Config;
};

export const SubmissionForm: FC<SubmissionFormProps> = ({ config }) => {
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
    const createTempFile = (content: BlobPart, mimeType: any, fileName: string) => {
        // Create a Blob from the content
        const blob = new Blob([content], { type: mimeType });

        // Optionally, you can create a File object, but note that
        // this won't give you a file path, just a file-like object
        const file = new File([blob], fileName, { type: mimeType });

        // Return the temporary URL and the File object
        return file;
    };
    const handleLoadSampleData = async () => {
        const sampleMetadataContent = `
            header	date	region	country	division	host
            custom0	2020-12-26	Europe	Switzerland	Bern	Homo sapiens
            custom1	2020-12-15	Europe	Switzerland	Schaffhausen	Homo sapiens
            custom2	2020-12-02	Europe	Switzerland	Bern	Homo sapiens
            custom2	2020-12-02	Europe	Switzerland	Bern	Homo sapiens
            custom2	2020-12-02	Europe	Switzerland	Bern	Homo sapiens`;
        const sampleSequenceContent = `
            >custom0
            ACTG
            >custom1
            ACTG
            >custom2
            ACTG
            >custom3
            ACTG`;

        const metadataFile = createTempFile(sampleMetadataContent, 'text/tab-separated-values', 'metadata.tsv');
        const sequenceFile = createTempFile(sampleSequenceContent, 'application/octet-stream', 'sequences.fasta');
        document.getElementById('real-file')?.click();
        // Set sample data here
        setUsername('testuser');
        setMetadataFile(metadataFile);
        setSequencesFile(sequenceFile);
        // setSequencesFile(sampleSequencesFile); // Assuming you have a way to set a sample file
    };

    return (
        <div className='flex flex-col items-center'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={handleCloseError} />
            <DataUploadForm
                targetUrl={`${config.backendUrl}/submit`}
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
