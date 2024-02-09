import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import TextField from '@mui/material/TextField';
import { type FC, type FormEvent, useState } from 'react';

import { getClientLogger } from '../../clientLogger';
import { datasetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';
import { withQueryProvider } from '../common/withProvider';

const logger = getClientLogger('AuthorDetailsForm');

type Props = {
    clientConfig: ClientConfig;
    accessToken: string;
    authorId?: string;
    name?: string;
    affiliation?: string;
    email?: string;
    emailVerified?: boolean;
};

const AuthorDetailsFormInner: FC<Props> = ({
    clientConfig,
    accessToken,
    authorId,
    name,
    affiliation,
    email,
    emailVerified,
}) => {
    const [authorName, setAuthorName] = useState(name ?? '');
    const [authorAffiliation, setAuthorAffiliation] = useState(affiliation ?? '');

    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();
    const { createAuthor, updateAuthor, isLoading } = useActionHooks(
        clientConfig,
        accessToken,
        openErrorFeedback,
        authorId,
    );

    const handleSubmit = () => {
        if (authorId !== undefined) {
            updateAuthor({
                name: authorName,
                affiliation: authorAffiliation,
                email: email ?? '',
                emailVerified: emailVerified ?? false,
            });
        } else {
            createAuthor({
                name: authorName,
                affiliation: authorAffiliation,
                email: email ?? '',
                emailVerified: emailVerified ?? false,
            });
        }
    };

    return (
        <div className='flex flex-col items-center  overflow-auto-y w-full h-full'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold py-4'>Edit Author Profile</h1>
            </div>
            <div className='space-y-6 max-w-md w-full'>
                <FormControl variant='outlined' fullWidth>
                    <TextField
                        className='text'
                        id='author-name'
                        onInput={(e: FormEvent<HTMLDivElement>) => {
                            setAuthorName((e.target as HTMLInputElement).value);
                        }}
                        label='Author name'
                        variant='outlined'
                        placeholder=''
                        size='small'
                        value={authorName}
                        required
                        focused
                        fullWidth
                        inputProps={{ maxLength: 255 }}
                    />
                    <FormHelperText id='outlined-weight-helper-text'>
                        Full name as it appears on your articles
                    </FormHelperText>
                </FormControl>
                <FormControl variant='outlined' fullWidth>
                    <TextField
                        className='text'
                        id='author-affiliation'
                        onInput={(e: FormEvent<HTMLDivElement>) => {
                            setAuthorAffiliation((e.target as HTMLInputElement).value);
                        }}
                        label='Author affiliation'
                        variant='outlined'
                        placeholder='E.g. Professor of Biology, University of Toronto'
                        size='small'
                        value={authorAffiliation}
                        required
                        fullWidth
                        inputProps={{ maxLength: 255 }}
                    />
                </FormControl>
            </div>
            <div className='pt-8'>
                <Button variant='outlined' onClick={handleSubmit}>
                    {isLoading ? <CircularProgress size={20} color='primary' /> : 'Save'}
                </Button>
            </div>
        </div>
    );
};

function useActionHooks(
    clientConfig: ClientConfig,
    accessToken: string,
    openErrorFeedback: (message: string) => void,
    authorId?: string,
) {
    const hooks = datasetCitationClientHooks(clientConfig);
    const create = hooks.useCreateAuthor(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async (response) => {
                await logger.info(`Successfully created author with authorId: ${response.authorId}`);
                location.reload();
            },
            onError: async (error) => {
                const message = `Failed to create author. Error: '${JSON.stringify(error)})}'`;
                await logger.info(message);
                openErrorFeedback(message);
            },
        },
    );
    const update = hooks.useUpdateAuthor(
        { headers: createAuthorizationHeader(accessToken), params: { authorId: authorId ?? '' } },
        {
            onSuccess: async (response) => {
                await logger.info(`Successfully updated author with authorId: ${response.authorId}`);
                location.reload();
            },
            onError: async (error) => {
                const message = `Failed to update author with authorId: ${authorId}. Error: '${JSON.stringify(
                    error,
                )})}'`;
                await logger.info(message);
                openErrorFeedback(message);
            },
        },
    );
    return {
        createAuthor: create.mutate,
        updateAuthor: update.mutate,
        isLoading: create.isLoading || update.isLoading,
    };
}

export const AuthorDetailsForm = withQueryProvider(AuthorDetailsFormInner);
