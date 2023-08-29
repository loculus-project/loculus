import { CircularProgress, TextField } from '@mui/material';
import React, { type ChangeEvent, type FC, type FormEvent, useState } from 'react';

import { ManagedErrorFeedback } from './ManagedErrorFeedback';
import { clientLogger } from '../../api';
import type { Config, HeaderId } from '../../types';

type SubmissionFormProps = {
    config: Config;
};

export const SubmissionForm: FC<SubmissionFormProps> = ({ config }) => {
    const [username, setUsername] = useState('');
    const [metadataFile, setMetadataFile] = useState<File | null>(null);
    const [sequencesFile, setSequencesFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);

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

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        if (!metadataFile || !sequencesFile) {
            handleOpenError('Please select both a metadata and sequences file');
            return;
        }

        const formData = new FormData();
        formData.append('username', username);
        formData.append('metadataFile', metadataFile);
        formData.append('sequenceFile', sequencesFile);

        setIsLoading(true);
        try {
            const response = await fetch(`${config.backendUrl}/submit`, {
                method: 'POST',
                body: formData,
            });

            if (response.ok === true) {
                setResponseSequenceHeaders(await response.json());
            } else {
                handleOpenError(
                    `Submission failed with status code ${response.status} ${JSON.stringify(response.body, null, 2)}`,
                );
                await clientLogger.error(
                    `Submission failed with status code ${response.status} ${JSON.stringify(response.body, null, 2)}`,
                );
            }
        } catch (error) {
            handleOpenError('Submission failed with error ' + (error as Error).message);
            await clientLogger.error(`Submission failed with error '${(error as Error).message}'`);
        }
        setIsLoading(false);
    };

    return (
        <div className='flex flex-col items-center'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={handleCloseError} />
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
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setMetadataFile(event.target.files?.[0] || null)
                    }
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
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setSequencesFile(event.target.files?.[0] || null)
                    }
                    disabled={false}
                    InputLabelProps={{
                        shrink: true,
                    }}
                />

                <button className='px-4 py-2 btn normal-case w-1/5' disabled={isLoading} type='submit'>
                    {isLoading ? <CircularProgress size={20} color='primary' /> : 'Submit'}
                </button>
            </form>

            <div>
                {responseSequenceHeaders ? (
                    <div className='p-6 space-y-6 max-w-md w-full'>
                        <h2 className='text-lg font-bold'>Response Sequence Headers</h2>
                        <ul className='list-disc list-inside'>
                            {responseSequenceHeaders.map((header) => (
                                <li key={header.id}>
                                    {header.id} {header.header}
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
