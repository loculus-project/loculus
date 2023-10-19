import { CircularProgress, TextField } from '@mui/material';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import type { ClientConfig, HeaderId } from '../types.ts';
import { ClientSideBackendClient } from '../services/clientSideBackendClient.ts';

type DataUploadFormProps = {
    clientConfig: ClientConfig;
    action: 'submit' | 'revise';
    onSuccess: (value: HeaderId[]) => void;
    onError: (message: string) => void;
};

export const DataUploadForm = ({ clientConfig, action, onSuccess, onError }: DataUploadFormProps) => {
    const [username, setUsername] = useState('');
    const [metadataFile, setMetadataFile] = useState<File | null>(null);
    const [sequenceFile, setSequenceFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleLoadExampleData = async () => {
        const { metadataFileContent, revisedMetadataFileContent, sequenceFileContent } = getExampleData();

        const exampleMetadataContent = action === `submit` ? metadataFileContent : revisedMetadataFileContent;

        const metadataFile = createTempFile(exampleMetadataContent, 'text/tab-separated-values', 'metadata.tsv');
        const sequenceFile = createTempFile(sequenceFileContent, 'application/octet-stream', 'sequences.fasta');

        setUsername('testuser');
        setMetadataFile(metadataFile);
        setSequenceFile(sequenceFile);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        if (!metadataFile || !sequenceFile) {
            onError('Please select both a metadata and sequences file');
            return;
        }

        const formData = new FormData();
        formData.append('username', username);
        formData.append('metadataFile', metadataFile);
        formData.append('sequenceFile', sequenceFile);

        const backendClient = ClientSideBackendClient.create(clientConfig);

        setIsLoading(true);
        const result = await backendClient.call(action, {
            username,
            metadataFile,
            sequenceFile,
        });

        result.match(
            (value) => onSuccess(value),
            (error) => onError(error.message),
        );
        setIsLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className='p-6 space-y-6 max-w-md w-full'>
            <TextField
                variant='outlined'
                margin='dense'
                size='small'
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={false}
                InputLabelProps={{
                    shrink: true,
                }}
                label={username === '' ? undefined : 'Username:'}
                placeholder={username !== '' ? undefined : 'Username:'}
            />

            <TextField
                variant='outlined'
                margin='dense'
                label='Metadata File:'
                placeholder='Metadata File:'
                size='small'
                type='file'
                onChange={(event: ChangeEvent<HTMLInputElement>) => setMetadataFile(event.target.files?.[0] || null)}
                disabled={false}
                InputLabelProps={{
                    shrink: true,
                }}
            />

            <TextField
                variant='outlined'
                margin='dense'
                label='Sequences File:'
                placeholder='Sequences File:'
                size='small'
                type='file'
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSequenceFile(event.target.files?.[0] || null)}
                disabled={false}
                InputLabelProps={{
                    shrink: true,
                }}
            />
            <div className='flex gap-4'>
                <button type='button' className='px-4 py-2 btn normal-case ' onClick={handleLoadExampleData}>
                    Load Example Data
                </button>

                <button className='px-4 py-2 btn normal-case w-1/5' disabled={isLoading} type='submit'>
                    {isLoading ? <CircularProgress size={20} color='primary' /> : 'Submit'}
                </button>
            </div>
        </form>
    );
};

function getExampleData() {
    return {
        metadataFileContent: `
header	date	region	country	division	host
custom0	2020-12-26	Europe	Switzerland	Bern	Homo sapiens
custom1	2020-12-15	Europe	Switzerland	Schaffhausen	Homo sapiens
custom2	2020-12-02	Europe	Switzerland	Bern	Homo sapiens
custom3	2020-12-02	Europe	Switzerland	Bern	Homo sapiens`,
        revisedMetadataFileContent: `
sequenceId	header	date	region	country	division	host
1	custom0	2020-12-26	Europe	Switzerland	Bern	Homo sapiens
2	custom1	2020-12-15	Europe	Switzerland	Schaffhausen	Homo sapiens
3	custom2	2020-12-02	Europe	Switzerland	Bern	Homo sapiens
4	custom3	2020-12-02	Europe	Switzerland	Bern	Homo sapiens`,
        sequenceFileContent: `
>custom0
ACTG
>custom1
ACTG
>custom2
ACTG
>custom3
ACTG`,
    };
}

function createTempFile(content: BlobPart, mimeType: any, fileName: string) {
    const blob = new Blob([content], { type: mimeType });
    return new File([blob], fileName, { type: mimeType });
}
