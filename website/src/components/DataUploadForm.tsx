import { CircularProgress, TextField } from '@mui/material';
import { type ChangeEvent, type FormEvent, useState } from 'react';

import { clientLogger } from '../api.ts';

type DataUploadFormProps<ResultType> = {
    targetUrl: string;
    onSuccess: (value: ResultType[]) => void;
    onError: (message: string) => void;
};
export const DataUploadForm = <ResultType,>({ targetUrl, onSuccess, onError }: DataUploadFormProps<ResultType>) => {
    const [username, setUsername] = useState('');
    const [metadataFile, setMetadataFile] = useState<File | null>(null);
    const [sequencesFile, setSequencesFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        if (!metadataFile || !sequencesFile) {
            onError('Please select both a metadata and sequences file');
            return;
        }

        const formData = new FormData();
        formData.append('username', username);
        formData.append('metadataFile', metadataFile);
        formData.append('sequenceFile', sequencesFile);

        setIsLoading(true);
        try {
            const response = await fetch(targetUrl, {
                method: 'POST',
                body: formData,
            });

            if (response.ok === true) {
                onSuccess(await response.json());
            } else {
                onError(`Upload failed with status code ${response.status} ${JSON.stringify(response.body, null, 2)}`);
                await clientLogger.error(
                    `Upload failed with status code ${response.status} ${JSON.stringify(response.body, null, 2)}`,
                );
            }
        } catch (error) {
            onError('Upload failed with error ' + (error as Error).message);
            await clientLogger.error(`Revision failed with error '${(error as Error).message}'`);
        }
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
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSequencesFile(event.target.files?.[0] || null)}
                disabled={false}
                InputLabelProps={{
                    shrink: true,
                }}
            />

            <button className='px-4 py-2 btn normal-case w-1/5' disabled={isLoading} type='submit'>
                {isLoading ? <CircularProgress size={20} color='primary' /> : 'Submit'}
            </button>
        </form>
    );
};
