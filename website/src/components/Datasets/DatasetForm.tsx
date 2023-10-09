import CheckIcon from '@mui/icons-material/Check';
import ErrorIcon from '@mui/icons-material/Error';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import TextField from '@mui/material/TextField';
import { useQueries, useMutation } from '@tanstack/react-query';
import { type FC, type FormEvent, useState, useEffect } from 'react';

import { createDataset, updateDataset } from './api';
import { clientLogger, fetchSequenceDetails } from '../../api';
import type { Config, ClientConfig, Dataset, DatasetRecord } from '../../types';
import { ManagedErrorFeedback } from '../common/ManagedErrorFeedback';

type DatasetFormProps = {
    userId: string;
    editDataset?: Dataset;
    editDatasetRecords?: DatasetRecord[];
    config: Config;
    clientConfig: ClientConfig;
};

const serializeRecords = (recordType: string, records?: DatasetRecord[]) => {
    if (!recordType || !records) {
        return '';
    }
    if (recordType === 'SRA') {
        const sraAccession = records.filter((record) => record.type === 'SRA').map((record) => record.accession);
        return sraAccession.join(', ');
    }

    const genbankAccession = records.filter((record) => record.type === 'Genbank').map((record) => record.accession);
    return genbankAccession.join(', ');
};

const parseRecords = (recordType: string, records?: DatasetRecord[]): string[] => {
    if (!recordType || !records || records.length === 0) {
        return [];
    }
    if (recordType === 'SRA') {
        return records.filter((record) => record.type === 'SRA').map((record) => record.accession ?? '');
    }
    return records.filter((record) => record.type === 'Genbank').map((record) => record.accession ?? '');
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

    const [genbankAccessionsInput, setGenbankAccessionsInput] = useState(
        serializeRecords('Genbank', editDatasetRecords),
    );
    const [parsedGenbankAccessions, setParsedGenbankAccessions] = useState(parseRecords('Genbank', editDatasetRecords));
    const [sraAccessionsInput, setSraAccessionsInput] = useState(serializeRecords('SRA', editDatasetRecords));
    const [parsedSraAccessions, setParsedSraAccessions] = useState(parseRecords('SRA', editDatasetRecords));

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
        mutationFn: (dataset) => createDataset(userId, dataset, clientConfig),
    });

    const updateDatasetMutation = useMutation({
        mutationFn: (dataset) => updateDataset(userId, editDataset?.datasetId, dataset, clientConfig),
    });

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setIsLoading(true);

        const dataset = {
            name: datasetName,
            description: datasetDescription,
            records: [
                ...getAccessionsList('Genbank').map((accession) => ({
                    accession,
                    type: 'Genbank',
                })),
                ...getAccessionsList('SRA').map((accession) => ({
                    accession,
                    type: 'SRA',
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

    const getAccessionsList = (accessionType: string) => {
        const accessions = accessionType === 'Genbank' ? genbankAccessionsInput : sraAccessionsInput;
        return accessions
            .split(',')
            .map((accession) => accession.trim())
            .filter(Boolean);
    };

    const querySequenceDetails = async (accessionType: string, accession: string) => {
        let accessionConfig: Config = config;

        if (accessionType === 'SRA') {
            accessionConfig = {
                ...config,
                schema: {
                    ...config.schema,
                    primaryKey: 'sraAccession',
                },
            };
        }
        const response = await fetchSequenceDetails(accession, accessionConfig, clientConfig);
        if (response == null) {
            throw new Error(`No sequence details found for accession: ${accession}`);
        }
        return response;
    };

    useEffect(() => {
        const parseRecordsInput = () => {
            if (genbankAccessionsInput && genbankAccessionsInput.length > 0) {
                const accessions = genbankAccessionsInput.split(',').map((accession) => accession.trim());
                setParsedGenbankAccessions(accessions);
            }
            if (sraAccessionsInput && sraAccessionsInput.length > 0) {
                const accessions = sraAccessionsInput.split(',').map((accession) => accession.trim());
                setParsedSraAccessions(accessions);
            }
        };

        const timeOutId = setTimeout(async () => {
            parseRecordsInput();
        }, 2000);
        return () => clearTimeout(timeOutId);
    }, [sraAccessionsInput, genbankAccessionsInput]);

    const genBankQueries = useQueries(
        parsedGenbankAccessions.length === 0
            ? {
                  queries: [],
              }
            : {
                  queries: parsedGenbankAccessions.map((accession: string) => ({
                      queryKey: ['genbankAccession', accession],
                      queryFn: () => querySequenceDetails('Genbank', accession),
                      retry: false,
                  })),
              },
    );

    const sraQueries = useQueries(
        parsedSraAccessions.length === 0
            ? {
                  queries: [],
              }
            : {
                  queries: parsedSraAccessions.map((accession) => ({
                      queryKey: ['sraAccession', accession],
                      queryFn: () => querySequenceDetails('SRA', accession),
                      retry: false,
                  })),
              },
    );

    const renderAccessionStatus = (accessionType: string, accession: string) => {
        const accessionQueries = accessionType === 'Genbank' ? genBankQueries : sraQueries;
        const accessionKey = accessionType === 'Genbank' ? 'genbankAccession' : 'sraAccession';

        // TODO: improve this code to not rely on failure message (via queryCache?)
        const accessionQuery = accessionQueries.find(
            (accessionQuery) =>
                accessionQuery.data?.[accessionKey] === accession ||
                (accessionQuery.failureReason != null &&
                    accessionQuery.failureReason.message === `No sequence details found for accession: ${accession}`),
        );

        if (!accessionQuery || accessionQuery.isLoading) {
            return <CircularProgress size={20} color='primary' />;
        }
        if (accessionQuery.status === 'success') {
            return <CheckIcon />;
        }
        return <ErrorIcon />;
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
                    <div className='mb-4'>
                        <FormControl variant='outlined' fullWidth>
                            <TextField
                                id='accession-input'
                                label='GenBank accessions'
                                fullWidth
                                multiline
                                rows={4}
                                variant='outlined'
                                margin='none'
                                size='small'
                                value={genbankAccessionsInput}
                                onChange={(event) => setGenbankAccessionsInput(event.target.value)}
                            />
                            <FormHelperText id='outlined-weight-helper-text'>
                                Enter a list of comma-separated GenBank accessions.
                            </FormHelperText>
                        </FormControl>
                    </div>
                    <FormControl variant='outlined' fullWidth>
                        <TextField
                            id='accession-input'
                            label='SRA run accessions'
                            fullWidth
                            multiline
                            rows={4}
                            variant='outlined'
                            margin='none'
                            size='small'
                            value={sraAccessionsInput}
                            onChange={(event) => setSraAccessionsInput(event.target.value)}
                        />
                        <FormHelperText id='outlined-weight-helper-text'>
                            Enter a list of comma-separated SRA run accessions.
                        </FormHelperText>
                    </FormControl>
                </FormGroup>

                {genbankAccessionsInput.length > 0 || sraAccessionsInput.length > 0 ? (
                    <div>
                        <h2 className='text-lg font-bold'>Verified</h2>
                        <div className='p-6 space-y-6 max-w-md w-full'>
                            <div>
                                {getAccessionsList('Genbank').map((accession) => (
                                    <div key={accession} className='flex flex-row justify-between'>
                                        <div>{accession}</div>
                                        {renderAccessionStatus('Genbank', accession)}
                                    </div>
                                ))}
                                {getAccessionsList('SRA').map((accession) => (
                                    <div key={accession} className='flex flex-row justify-between'>
                                        <div>{accession}</div>
                                        {renderAccessionStatus('SRA', accession)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}

                <Button variant='outlined' disabled={isLoading} onClick={handleSubmit}>
                    {isLoading ? <CircularProgress size={20} color='primary' /> : 'Save'}
                </Button>
            </div>
        </div>
    );
};
