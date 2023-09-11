import { CircularProgress, TextField } from '@mui/material';
import React, { type ChangeEvent, type FC, type FormEvent, useState } from 'react';

import { clientLogger } from '../../api';
import type { Config } from '../../types';
import { ManagedErrorFeedback } from '../Submission/ManagedErrorFeedback';

type RevisionFormProps = {
    config: Config;
};

type RevisionResult = {
    sequenceId: number;
    version: number;
    genericError: string[];
};

export const RevisionForm: FC<RevisionFormProps> = ({ config }) => {
    const [username, setUsername] = useState('');
    const [metadataFile, setMetadataFile] = useState<File | null>(null);
    const [sequencesFile, setSequencesFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);

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
            const response = await fetch(`${config.backendUrl}/revise`, {
                method: 'POST',
                body: formData,
            });

            if (response.ok === true) {
                setResponseSequenceHeaders(await response.json());
            } else {
                handleOpenError(
                    `Revision failed with status code ${response.status} ${JSON.stringify(response.body, null, 2)}`,
                );
                await clientLogger.error(
                    `Revision failed with status code ${response.status} ${JSON.stringify(response.body, null, 2)}`,
                );
            }
        } catch (error) {
            handleOpenError('Revision failed with error ' + (error as Error).message);
            await clientLogger.error(`Revision failed with error '${(error as Error).message}'`);
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
                    <div className='p-6 space-y-6 w-full'>
                        <h2 className='text-lg font-bold'>Result of Revision</h2>
                        <ul className='list-disc list-inside'>
                            {responseSequenceHeaders.map((header) =>
                                header.genericError.length === 0 ? (
                                    <li key={header.sequenceId}>
                                        Sequence {header.sequenceId} successful revised; new version is {header.version}
                                    </li>
                                ) : (
                                    <li key={header.sequenceId}>
                                        Sequence {header.sequenceId} failed to revise: {header.genericError.join(', ')}
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
