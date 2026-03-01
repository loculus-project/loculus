import { AxiosError } from 'axios';
import { capitalCase } from 'change-case';
import { type FC, type FormEvent, useState, useEffect } from 'react';
import { toast } from 'react-toastify';

import { getClientLogger } from '../../clientLogger';
import { routes } from '../../routes/routes.ts';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ProblemDetail } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import { type SeqSet, type SeqSetRecord } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { deserializeAccessionInput, serializeSeqSetRecords } from '../../utils/parseAccessionInput';
import { Button } from '../common/Button';

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
    const [focalAccessionsInput, setFocalAccessionsInput] = useState(serializeSeqSetRecords(editSeqSetRecords, true));
    const [backgroundAccessionsInput, setBackgroundAccessionsInput] = useState(
        serializeSeqSetRecords(editSeqSetRecords, false),
    );
    const [seqSetRecordValidation, setSeqSetRecordValidation] = useState('');

    const { createSeqSet, updateSeqSet, validateSeqSetRecords, isPending } = useActionHooks(
        clientConfig,
        accessToken,
        (message) => toast.error(message, { position: 'top-center', autoClose: false }),
        setSeqSetRecordValidation,
    );

    useEffect(() => {
        const validationDelay = setTimeout(() => {
            const seqSetRecords = [
                ...deserializeAccessionInput(focalAccessionsInput, true),
                ...deserializeAccessionInput(backgroundAccessionsInput, false),
            ];
            if (seqSetRecords.length === 0) {
                setSeqSetRecordValidation('');
                return;
            }
            validateSeqSetRecords(seqSetRecords);
        }, 1000);
        return () => clearTimeout(validationDelay);
    }, [focalAccessionsInput, backgroundAccessionsInput, validateSeqSetRecords]);

    const setAccessionInput = (accessionInput: string, isFocal: boolean) => {
        if (isFocal) {
            setFocalAccessionsInput(accessionInput);
        } else {
            setBackgroundAccessionsInput(accessionInput);
        }
    };

    const getSeqSetFromInput = () => {
        return {
            name: seqSetName,
            description: seqSetDescription,
            records: [
                ...deserializeAccessionInput(focalAccessionsInput, true),
                ...deserializeAccessionInput(backgroundAccessionsInput, false),
            ],
        };
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const seqSet = getSeqSetFromInput();
        if (seqSet.name === '') {
            setSeqSetNameValidation('SeqSet name is required');
            return;
        }
        if (focalAccessionsInput === '' && backgroundAccessionsInput === '') {
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

    const renderAccessionInputField = (isFocal: boolean) => {
        const isFocalStr = isFocal ? 'focal' : 'background';
        const accessionsInput = isFocal ? focalAccessionsInput : backgroundAccessionsInput;
        return (
            <div>
                <div className='mb-6' key={`loculus-${isFocalStr}-input`}>
                    <label
                        htmlFor={`loculus-${isFocalStr}-accession-input`}
                        className='block mb-2 text-sm font-medium text-gray-900 dark:text-white'
                    >
                        {`${isFocal ? '* ' : ''}${capitalCase(isFocalStr)} accessions (separated by comma or whitespace)`}
                    </label>
                    <textarea
                        id={`loculus-${isFocalStr}-accession-input`}
                        className={getTextAreaStyles(seqSetRecordValidation)}
                        value={accessionsInput}
                        onChange={(event) => {
                            setAccessionInput(event.target.value, isFocal);
                        }}
                        rows={4}
                        cols={40}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className='flex flex-col items-center  overflow-auto-y w-full'>
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold py-4'>{`${editSeqSet ? 'Edit' : 'Create a'} SeqSet`}</h1>
            </div>
            <div className='max-w-lg w-full'>
                <div>
                    <label
                        htmlFor='seqSet-name'
                        className='block mb-2 text-sm font-medium text-gray-900 dark:text-white'
                    >
                        * SeqSet name
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
                        SeqSet description
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
                <h1 className='text-lg font-semibold py-4'>Accessions</h1>
                {renderAccessionInputField(true)}
                {renderAccessionInputField(false)}
                <div className='max-w-md w-full'>
                    {seqSetRecordValidation !== '' ? (
                        <p className='pb-4 text-red-500 text-sm italic'>{seqSetRecordValidation}</p>
                    ) : null}
                </div>
                <div className='pb-4'>
                    <span className='label-text'>
                        Review
                        <a href={routes.datauseTermsPage()} target='_blank' className='underline ml-1'>
                            data use terms
                        </a>
                        .
                    </span>
                </div>
            </div>
            <Button
                className='flex items-center btn loculusColor text-white hover:bg-primary-700'
                disabled={isPending || seqSetRecordValidation !== '' || seqSetNameValidation !== ''}
                onClick={handleSubmit}
            >
                {isPending ? <span className='loading loading-spinner loading-sm mr-2 relative top-1' /> : 'Save'}
            </Button>
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
            onSuccess: async (response: { seqSetId: string; seqSetVersion: number }) => {
                await logger.info(`Successfully created seqSet with seqSetId: ${response.seqSetId}`);
                const redirectUrl = `/seqsets/${response.seqSetId}.${response.seqSetVersion}`;
                location.href = redirectUrl;
            },
            onError: async (error: unknown) => {
                await logger.info(`Failed to create seqSet. Error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError) {
                    const responseData = error.response?.data as ProblemDetail | undefined;
                    if (responseData !== undefined) {
                        openErrorFeedback(`Failed to create seqSet. ${responseData.title}. ${responseData.detail}`);
                    }
                }
            },
        },
    );
    const update = hooks.useUpdateSeqSet(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async (response: { seqSetId: string; seqSetVersion: number }) => {
                await logger.info(`Successfully updated seqSet with seqSetId: ${response.seqSetId}`);
                const redirectUrl = `/seqsets/${response.seqSetId}.${response.seqSetVersion}`;
                location.href = redirectUrl;
            },
            onError: async (error) => {
                await logger.info(`Failed to update seqSet. Error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError) {
                    const responseData = error.response?.data as ProblemDetail | undefined;
                    if (responseData !== undefined) {
                        openErrorFeedback(`Failed to update seqSet. ${responseData.title}. ${responseData.detail}`);
                    }
                }
            },
        },
    );
    const validateRecords = hooks.useValidateSeqSetRecords(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: () => {
                setSeqSetRecordValidation('');
            },
            onError: async (error) => {
                await logger.info(`Failed to validate seqSet records. Error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError && error.response?.data !== undefined) {
                    const responseData = error.response.data as ProblemDetail;
                    const message = `${responseData.title}. ${responseData.detail}`;
                    setSeqSetRecordValidation(message);
                }
            },
        },
    );
    return {
        createSeqSet: create.mutate,
        updateSeqSet: update.mutate,
        validateSeqSetRecords: validateRecords.mutate,
        isPending: create.isPending || update.isPending,
    };
}
