import CircularProgress from '@mui/material/CircularProgress';
import { AxiosError } from 'axios';
import { type FC, type FormEvent, useState, useEffect, useCallback } from 'react';

import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { SeqSetRecordType, type SeqSet, type SeqSetRecord } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { serializeRecordsToAccessionsInput } from '../../utils/parseAccessionInput';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';

const logger = getClientLogger('SeqSetForm');

type SeqSetFormProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    editSeqSet?: SeqSet;
    editSeqSetRecords?: SeqSetRecord[];
};

export const SeqSetForm: FC<SeqSetFormProps> = ({ clientConfig, accessToken, editSeqSet, editSeqSetRecords }) => {
    const [seqSetName, setSeqSetName] = useState(editSeqSet?.name ?? '');
    const [seqSetNameValidation, setSeqSetNameValidation] = useState('');
    const [seqSetDescription, setSeqSetDescription] = useState(editSeqSet?.description ?? '');
    const [accessionsInput, setAccessionsInput] = useState(serializeRecordsToAccessionsInput(editSeqSetRecords));
    const [seqSetRecordValidation, setSeqSetRecordValidation] = useState('');

    const {
        errorMessage: serverErrorMessage,
        isErrorOpen,
        openErrorFeedback,
        closeErrorFeedback,
    } = useErrorFeedbackState();

    const { createSeqSet, updateSeqSet, validateSeqSetRecords, isLoading } = useActionHooks(
        clientConfig,
        accessToken,
        openErrorFeedback,
        setSeqSetRecordValidation,
    );

    const getAccessionsByType = useCallback(
        (type: SeqSetRecordType) => {
            const accessions = accessionsInput[type];
            return accessions
                .split(/[,\s]/)
                .map((accession) => accession.trim())
                .filter(Boolean);
        },
        [accessionsInput],
    );

    useEffect(() => {
        const validationDelay = setTimeout(async () => {
            const seqSetRecords = getAccessionsByType(SeqSetRecordType.loculus).map((accession) => ({
                accession,
                type: SeqSetRecordType.loculus,
            }));
            if (seqSetRecords.length === 0) {
                setSeqSetRecordValidation('');
                return;
            }
            validateSeqSetRecords(seqSetRecords);
        }, 1000);
        return () => clearTimeout(validationDelay);
    }, [accessionsInput, getAccessionsByType, validateSeqSetRecords]);

    const setAccessionInput = (accessionInput: string, type: SeqSetRecordType) => {
        setAccessionsInput((prevState) => ({
            ...prevState,
            [type]: accessionInput,
        }));
    };

    const getSeqSetFromInput = () => {
        return {
            name: seqSetName,
            description: seqSetDescription,
            records: [
                ...getAccessionsByType(SeqSetRecordType.loculus).map((accession) => ({
                    accession,
                    type: SeqSetRecordType.loculus,
                })),
            ],
        };
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const seqSet = getSeqSetFromInput();
        if (seqSet.name === '') {
            setSeqSetNameValidation('SeqSet name is required');
            return;
        }
        if (getAccessionsByType(SeqSetRecordType.loculus).length === 0) {
            setSeqSetRecordValidation('At least one Loculus accession is required');
            return;
        }
        if (editSeqSet !== undefined) {
            updateSeqSet({
                seqSetId: editSeqSet.seqSetId,
                ...seqSet,
            });
        } else {
            createSeqSet(seqSet);
        }
        return;
    };

    const getTextAreaStyles = (validationMessage: string = '') => {
        if (validationMessage === '') {
            return 'block w-full p-4 text-gray-900 border border-gray-300 rounded-lg bg-gray-50 text-base focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500';
        }
        return 'block w-full p-4 text-gray-900 border border-red-300 rounded-lg bg-gray-50 text-base focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:border-red-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-red-500 dark:focus:border-red-500';
    };

    const getInputFieldStyles = (validationMessage: string = '') => {
        if (validationMessage === '') {
            return 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500';
        }
        return 'bg-gray-50 border border-red-300 text-gray-900 text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block w-full p-2.5 dark:bg-gray-700 dark:border-red-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-red-500 dark:focus:border-red-500';
    };

    return (
        <div className='flex flex-col items-center  overflow-auto-y w-full'>
            <ManagedErrorFeedback message={serverErrorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold py-4'>{`${editSeqSet ? 'Edit' : 'Create'} SeqSet`}</h1>
            </div>
            <div className='space-y-6 max-w-md w-full'>
                <div className='mb-6'>
                    <label
                        htmlFor='seqSet-name'
                        className='block mb-2 text-sm font-medium text-gray-900 dark:text-white'
                    >
                        SeqSet name *
                    </label>
                    <input
                        type='text'
                        id='seqSet-name'
                        className={getInputFieldStyles(seqSetNameValidation)}
                        value={seqSetName}
                        onChange={(e) => {
                            setSeqSetName((e.target as HTMLInputElement).value);
                            setSeqSetNameValidation('');
                        }}
                        maxLength={255}
                        required
                    />
                    <div className='pb-6 max-w-md w-full'>
                        <p className='text-red-500 text-sm italic'>{seqSetNameValidation}</p>
                    </div>
                </div>

                <div className='mb-6'>
                    <label
                        htmlFor='seqSet-description'
                        className='block mb-2 text-sm font-medium text-gray-900 dark:text-white'
                    >
                        Optional description
                    </label>
                    <input
                        type='text'
                        id='seqSet-description'
                        className={getInputFieldStyles()}
                        value={seqSetDescription}
                        onChange={(e) => {
                            setSeqSetDescription((e.target as HTMLInputElement).value);
                        }}
                        maxLength={255}
                    />
                </div>
                <h2 className='text-lg font-bold'>Accessions</h2>

                {Object.keys(accessionsInput).map((type) => (
                    <div className='mb-6' key={`${type}-input-field`}>
                        <label
                            htmlFor='seqSet-description'
                            className='block mb-2 text-sm font-medium text-gray-900 dark:text-white'
                        >
                            {`List of ${type} accessions delimited by comma, newline, or space *`}
                        </label>
                        <textarea
                            id={`${type}-accession-input`}
                            className={getTextAreaStyles(seqSetRecordValidation)}
                            value={accessionsInput[type as SeqSetRecordType]}
                            onChange={(event: any) => {
                                setAccessionInput(event.target.value, type as SeqSetRecordType);
                            }}
                            rows={4}
                            cols={40}
                        />
                    </div>
                ))}
                <div className='pb-6 max-w-md w-full'>
                    <p className='text-red-500 text-sm italic'>{seqSetRecordValidation}</p>
                </div>
            </div>
            <button
                className='flex items-center btn loculusColor text-white hover:bg-primary-700'
                disabled={isLoading || seqSetRecordValidation !== '' || seqSetNameValidation !== ''}
                onClick={handleSubmit}
            >
                {isLoading ? <CircularProgress size={20} color='primary' /> : 'Save'}
            </button>
        </div>
    );
};

function useActionHooks(
    clientConfig: ClientConfig,
    accessToken: string,
    openErrorFeedback: (message: string) => void,
    setSeqSetRecordValidation: (message: string) => void,
) {
    const hooks = seqSetCitationClientHooks(clientConfig);
    const create = hooks.useCreateSeqSet(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async (response) => {
                await logger.info(`Successfully created seqSet with seqSetId: ${response.seqSetId}`);
                const redirectUrl = `/seqsets/${response.seqSetId}?version=${response.seqSetVersion}`;
                location.href = redirectUrl;
            },
            onError: async (error: unknown) => {
                await logger.info(`Failed to create seqSet. Error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError) {
                    if (error.response?.data !== undefined) {
                        openErrorFeedback(
                            `Failed to create seqSet. ${error.response.data?.title}. ${error.response.data?.detail}`,
                        );
                    }
                }
            },
        },
    );
    const update = hooks.useUpdateSeqSet(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async (response) => {
                await logger.info(`Successfully updated seqSet with seqSetId: ${response.seqSetId}`);
                const redirectUrl = `/seqsets/${response.seqSetId}?version=${response.seqSetVersion}`;
                location.href = redirectUrl;
            },
            onError: async (error) => {
                await logger.info(`Failed to update seqSet. Error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError) {
                    if (error.response?.data !== undefined) {
                        openErrorFeedback(
                            `Failed to update seqSet. ${error.response.data?.title}. ${error.response.data?.detail}`,
                        );
                    }
                }
            },
        },
    );
    const validateRecords = hooks.useValidateSeqSetRecords(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async () => {
                setSeqSetRecordValidation('');
            },
            onError: async (error) => {
                await logger.info(`Failed to validate seqSet records. Error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError && error.response?.data !== undefined) {
                    const message = `${error.response.data.title}. ${error.response.data.detail}`;
                    setSeqSetRecordValidation(message);
                }
            },
        },
    );
    return {
        createSeqSet: create.mutate,
        updateSeqSet: update.mutate,
        validateSeqSetRecords: validateRecords.mutate,
        isLoading: create.isLoading || update.isLoading,
    };
}
