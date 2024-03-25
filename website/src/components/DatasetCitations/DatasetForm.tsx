import CircularProgress from '@mui/material/CircularProgress';
import { AxiosError } from 'axios';
import { type FC, type FormEvent, useState, useEffect, useCallback } from 'react';

import { getClientLogger } from '../../clientLogger';
import { datasetCitationClientHooks } from '../../services/serviceHooks';
import { DatasetRecordType, type Dataset, type DatasetRecord } from '../../types/datasetCitation';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { serializeRecordsToAccessionsInput } from '../../utils/parseAccessionInput';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';

const logger = getClientLogger('DatasetForm');

type DatasetFormProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    editDataset?: Dataset;
    editDatasetRecords?: DatasetRecord[];
};

export const DatasetForm: FC<DatasetFormProps> = ({ clientConfig, accessToken, editDataset, editDatasetRecords }) => {
    const [datasetName, setDatasetName] = useState(editDataset?.name ?? '');
    const [datasetNameValidation, setDatasetNameValidation] = useState('');
    const [datasetDescription, setDatasetDescription] = useState(editDataset?.description ?? '');
    const [accessionsInput, setAccessionsInput] = useState(serializeRecordsToAccessionsInput(editDatasetRecords));
    const [datasetRecordValidation, setDatasetRecordValidation] = useState('');

    const {
        errorMessage: serverErrorMessage,
        isErrorOpen,
        openErrorFeedback,
        closeErrorFeedback,
    } = useErrorFeedbackState();

    const { createDataset, updateDataset, validateDatasetRecords, isLoading } = useActionHooks(
        clientConfig,
        accessToken,
        openErrorFeedback,
        setDatasetRecordValidation,
    );

    const getAccessionsByType = useCallback(
        (type: DatasetRecordType) => {
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
            const datasetRecords = getAccessionsByType(DatasetRecordType.loculus).map((accession) => ({
                accession,
                type: DatasetRecordType.loculus,
            }));
            if (datasetRecords.length === 0) {
                setDatasetRecordValidation('');
                return;
            }
            validateDatasetRecords(datasetRecords);
        }, 1000);
        return () => clearTimeout(validationDelay);
    }, [accessionsInput, getAccessionsByType, validateDatasetRecords]);

    const setAccessionInput = (accessionInput: string, type: DatasetRecordType) => {
        setAccessionsInput((prevState) => ({
            ...prevState,
            [type]: accessionInput,
        }));
    };

    const getDatasetFromInput = () => {
        return {
            name: datasetName,
            description: datasetDescription,
            records: [
                ...getAccessionsByType(DatasetRecordType.loculus).map((accession) => ({
                    accession,
                    type: DatasetRecordType.loculus,
                })),
            ],
        };
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const dataset = getDatasetFromInput();
        if (dataset.name === '') {
            setDatasetNameValidation('Dataset name is required');
            return;
        }
        if (getAccessionsByType(DatasetRecordType.loculus).length === 0) {
            setDatasetRecordValidation('At least one Loculus accession is required');
            return;
        }
        if (editDataset !== undefined) {
            updateDataset({
                datasetId: editDataset.datasetId,
                ...dataset,
            });
        } else {
            createDataset(dataset);
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
                <h1 className='text-xl font-semibold py-4'>{`${editDataset ? 'Edit' : 'Create a'} Dataset`}</h1>
            </div>
            <div className='max-w-md w-full'>
                <div>
                    <label
                        htmlFor='dataset-name'
                        className='block mb-2 text-sm font-medium text-gray-900 dark:text-white'
                    >
                        Dataset name *
                    </label>
                    <input
                        type='text'
                        id='dataset-name'
                        className={getInputFieldStyles(datasetNameValidation)}
                        value={datasetName}
                        onChange={(e) => {
                            setDatasetName((e.target as HTMLInputElement).value);
                            setDatasetNameValidation('');
                        }}
                        maxLength={255}
                        required
                    />
                    <div className='pb-6 max-w-md w-full'>
                        <p className='text-red-500 text-sm italic'>{datasetNameValidation}</p>
                    </div>
                </div>

                <div className='mb-6'>
                    <label
                        htmlFor='dataset-description'
                        className='block mb-2 text-sm font-medium text-gray-900 dark:text-white'
                    >
                        Optional description
                    </label>
                    <input
                        type='text'
                        id='dataset-description'
                        className={getInputFieldStyles()}
                        value={datasetDescription}
                        onChange={(e) => {
                            setDatasetDescription((e.target as HTMLInputElement).value);
                        }}
                        maxLength={255}
                    />
                </div>

                {Object.keys(accessionsInput).map((type) => (
                    <div className='mb-6' key={`${type}-input-field`}>
                        <label
                            htmlFor='dataset-description'
                            className='block mb-2 text-sm font-medium text-gray-900 dark:text-white'
                        >
                            {`List of ${type} accessions delimited by comma, newline, or space *`}
                        </label>
                        <textarea
                            id={`${type}-accession-input`}
                            className={getTextAreaStyles(datasetRecordValidation)}
                            value={accessionsInput[type as DatasetRecordType]}
                            onChange={(event: any) => {
                                setAccessionInput(event.target.value, type as DatasetRecordType);
                            }}
                            rows={4}
                            cols={40}
                        />
                    </div>
                ))}
                <div className='pb-6 max-w-md w-full'>
                    <p className='text-red-500 text-sm italic'>{datasetRecordValidation}</p>
                </div>
            </div>
            <button
                className='flex items-center btn loculusColor text-white hover:bg-primary-700'
                disabled={isLoading || datasetRecordValidation !== '' || datasetNameValidation !== ''}
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
    setDatasetRecordValidation: (message: string) => void,
) {
    const hooks = datasetCitationClientHooks(clientConfig);
    const create = hooks.useCreateDataset(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async (response) => {
                await logger.info(`Successfully created dataset with datasetId: ${response.datasetId}`);
                const redirectUrl = `/datasets/${response.datasetId}?version=${response.datasetVersion}`;
                location.href = redirectUrl;
            },
            onError: async (error: unknown) => {
                await logger.info(`Failed to create dataset. Error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError) {
                    if (error.response?.data !== undefined) {
                        openErrorFeedback(
                            `Failed to create dataset. ${error.response.data?.title}. ${error.response.data?.detail}`,
                        );
                    }
                }
            },
        },
    );
    const update = hooks.useUpdateDataset(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async (response) => {
                await logger.info(`Successfully updated dataset with datasetId: ${response.datasetId}`);
                const redirectUrl = `/datasets/${response.datasetId}?version=${response.datasetVersion}`;
                location.href = redirectUrl;
            },
            onError: async (error) => {
                await logger.info(`Failed to update dataset. Error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError) {
                    if (error.response?.data !== undefined) {
                        openErrorFeedback(
                            `Failed to update dataset. ${error.response.data?.title}. ${error.response.data?.detail}`,
                        );
                    }
                }
            },
        },
    );
    const validateRecords = hooks.useValidateDatasetRecords(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async () => {
                setDatasetRecordValidation('');
            },
            onError: async (error) => {
                await logger.info(`Failed to validate dataset records. Error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError && error.response?.data !== undefined) {
                    const message = `${error.response.data.title}. ${error.response.data.detail}`;
                    setDatasetRecordValidation(message);
                }
            },
        },
    );
    return {
        createDataset: create.mutate,
        updateDataset: update.mutate,
        validateDatasetRecords: validateRecords.mutate,
        isLoading: create.isLoading || update.isLoading,
    };
}
