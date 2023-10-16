import CheckIcon from '@mui/icons-material/Check';
import ErrorIcon from '@mui/icons-material/Error';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import TextField from '@mui/material/TextField';
import { useQueries, useMutation, type UseQueryResult } from '@tanstack/react-query';
import { type FC, type FormEvent, useState, useEffect } from 'react';

import { createDataset, updateDataset } from './api';
import { clientLogger, fetchSequenceDetails } from '../../api';
import { AccessionType, type Config, type ClientConfig, type Dataset, type DatasetRecord } from '../../types';
import { serializeRecordsToAccessionsInput, parseRecordsFromAccessionInput } from '../../utils/parseAccessionInput';
import { ManagedErrorFeedback } from '../common/ManagedErrorFeedback';

type DatasetFormProps = {
    userId: string;
    editDataset?: Dataset;
    editDatasetRecords?: DatasetRecord[];
    config: Config;
    clientConfig: ClientConfig;
};

export const DatasetForm: FC<DatasetFormProps> = ({
    userId,
    editDataset,
    editDatasetRecords,
    config,
    clientConfig,
}) => {
    const [datasetName, setDatasetName] = useState(editDataset?.name ?? '');
    const [datasetDescription, setDatasetDescription] = useState(editDataset?.description ?? '');

    const [accessionsInput, setAccessionsInput] = useState(serializeRecordsToAccessionsInput(editDatasetRecords));
    const [datasetRecords, setDatasetRecords] = useState(editDatasetRecords);

    const [isLoading, setIsLoading] = useState(false);
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

    const createDatasetMutation = useMutation({
        mutationFn: (dataset: Partial<Dataset>) => createDataset(userId, dataset, clientConfig),
    });

    const updateDatasetMutation = useMutation({
        mutationFn: (dataset: Partial<Dataset>) =>
            updateDataset(userId, editDataset?.datasetId ?? '', dataset, clientConfig),
    });

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setIsLoading(true);

        const dataset = {
            name: datasetName,
            description: datasetDescription,
            records: [
                ...getAccessionsList(AccessionType.pathoplexus).map((accession) => ({
                    accession,
                    type: AccessionType.pathoplexus,
                })),
                ...getAccessionsList(AccessionType.genbank).map((accession) => ({
                    accession,
                    type: AccessionType.genbank,
                })),
                ...getAccessionsList(AccessionType.sra).map((accession) => ({
                    accession,
                    type: AccessionType.sra,
                })),
                ...getAccessionsList(AccessionType.gisaid).map((accession) => ({
                    accession,
                    type: AccessionType.gisaid,
                })),
            ],
        };
        let redirectUrl = '/datasets';

        const isEdit = editDataset != null;

        if (isEdit) {
            try {
                const response = await updateDatasetMutation.mutateAsync(dataset);
                await clientLogger.info(`Dataset edit successful, datasetId: '${editDataset.datasetId}'`);
                redirectUrl = `/datasets/${response?.datasetId}?version=${response?.datasetVersion}`;
            } catch (error) {
                handleOpenError(
                    `Dataset edit failed with error '${(error as Error).message}', datasetId: '${
                        editDataset.datasetId
                    }'`,
                );
                await clientLogger.error(
                    `Dataset edit failed with error '${(error as Error).message}', datasetId: '${
                        editDataset.datasetId
                    }'`,
                );
            }
        } else {
            try {
                const response = await createDatasetMutation.mutateAsync(dataset);
                await clientLogger.info(`Dataset create successful with datasetId: ${response?.datasetId}`);
                redirectUrl = `/datasets/${response?.datasetId}?version=${response?.datasetVersion}`;
            } catch (error) {
                handleOpenError(`Dataset create failed with error '${(error as Error).message}'`);
                await clientLogger.error(`Dataset create failed with error '${(error as Error).message}'`);
            }
        }
        setIsLoading(false);
        location.href = redirectUrl;
        return;
    };

    const getAccessionsList = (type: AccessionType) => {
        const accessions = accessionsInput[type];
        return accessions
            .split(',')
            .map((accession) => accession.trim())
            .filter(Boolean);
    };

    const querySequenceDetails = async (type: AccessionType, accession: string) => {
        let accessionConfig: Config = config;

        if (type === 'SRA') {
            accessionConfig = {
                ...config,
                schema: {
                    ...config.schema,
                    primaryKey: 'sraAccession',
                },
            };
        }
        try {
            const response = await fetchSequenceDetails(accession, accessionConfig, clientConfig);
            return response;
        } catch (error) {
            throw new Error(
                `Failed to fetch sequence details for accession: ${accession}. Error: ${(error as Error).message}`,
            );
        }
    };

    useEffect(() => {
        const parseRecordsFromInput = () => {
            const parsedRecords = parseRecordsFromAccessionInput(accessionsInput);
            setDatasetRecords(parsedRecords);
        };

        const timeOutId = setTimeout(async () => {
            parseRecordsFromInput();
        }, 2000);
        return () => clearTimeout(timeOutId);
    }, [accessionsInput]);

    const accessionQueries: UseQueryResult<DatasetRecord>[] = useQueries(
        datasetRecords == null || datasetRecords.length === 0
            ? {
                  queries: [],
              }
            : {
                  queries: datasetRecords.map((record) => ({
                      queryKey: [record.type, record.accession],
                      queryFn: () => querySequenceDetails(record.type as AccessionType, record.accession ?? ''),
                      retry: false,
                  })),
              },
    );

    const renderAccessionStatus = (type: string, accession: string) => {
        const accessionQuery = accessionQueries.find(
            (accessionQuery: any) =>
                accessionQuery.data?.[type] === accession ||
                (accessionQuery?.failureReason != null && accessionQuery?.failureReason?.message.includes(accession)),
        );

        if (accessionQuery == null || accessionQuery.isLoading === true) {
            return <CircularProgress size={20} color='primary' />;
        }
        if (accessionQuery.status === 'success') {
            return <CheckIcon />;
        }
        return <ErrorIcon />;
    };

    const setAccessionInput = (accessionInput: string, type: AccessionType) => {
        setAccessionsInput((prevState) => ({
            ...prevState,
            [type]: accessionInput,
        }));
    };

    return (
        <div className='flex flex-col items-center  overflow-auto-y w-full'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={handleCloseError} />
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold py-4'>{`${editDataset ? 'Edit' : 'Create'} Dataset`}</h1>
            </div>
            <div className='space-y-6 max-w-md w-full'>
                <FormControl variant='outlined' fullWidth>
                    <TextField
                        id='dataset-name'
                        className='text'
                        onInput={(e) => {
                            setDatasetName((e.target as HTMLInputElement).value);
                        }}
                        label='Enter a name for your dataset'
                        variant='outlined'
                        placeholder=''
                        size='small'
                        value={datasetName}
                        required
                    />
                </FormControl>
                <FormControl variant='outlined' fullWidth>
                    <TextField
                        id='dataset-description'
                        className='text'
                        onInput={(e) => {
                            setDatasetDescription((e.target as HTMLInputElement).value);
                        }}
                        label='Enter an optional description'
                        variant='outlined'
                        placeholder=''
                        size='small'
                        multiline
                        value={datasetDescription}
                        rows={2}
                    />
                </FormControl>
                <h2 className='text-lg font-bold'>Accessions</h2>
                <FormGroup>
                    {Object.keys(accessionsInput).map((type) => (
                        <div className='mb-4' key={`${type}-input-field`}>
                            <FormControl variant='outlined' fullWidth>
                                <TextField
                                    id={`${type}-accession-input`}
                                    label={`${type} accessions`}
                                    fullWidth
                                    multiline
                                    rows={4}
                                    variant='outlined'
                                    margin='none'
                                    size='small'
                                    value={accessionsInput[type as AccessionType]}
                                    onChange={(event: any) =>
                                        setAccessionInput(event.target.value, type as AccessionType)
                                    }
                                />
                                <FormHelperText id='outlined-weight-helper-text'>
                                    {`Enter a list of comma-separated ${type} accessions.`}
                                </FormHelperText>
                            </FormControl>
                        </div>
                    ))}
                </FormGroup>

                <div>
                    <h2 className='text-lg font-bold'>Verified</h2>
                    <div className='p-6 space-y-6 max-w-md w-full'>
                        <div>
                            {getAccessionsList(AccessionType.pathoplexus).map((accession) => (
                                <div key={accession} className='flex flex-row justify-between'>
                                    <div>{accession}</div>
                                    {renderAccessionStatus(AccessionType.pathoplexus, accession)}
                                </div>
                            ))}
                            {getAccessionsList(AccessionType.genbank).map((accession) => (
                                <div key={accession} className='flex flex-row justify-between'>
                                    <div>{accession}</div>
                                    {renderAccessionStatus(AccessionType.genbank, accession)}
                                </div>
                            ))}
                            {getAccessionsList(AccessionType.sra).map((accession) => (
                                <div key={accession} className='flex flex-row justify-between'>
                                    <div>{accession}</div>
                                    {renderAccessionStatus(AccessionType.sra, accession)}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <Button variant='outlined' disabled={isLoading} onClick={handleSubmit}>
                    {isLoading ? <CircularProgress size={20} color='primary' /> : 'Save'}
                </Button>
            </div>
        </div>
    );
};
