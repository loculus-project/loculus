import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import TextField from '@mui/material/TextField';
import { type FC, type FormEvent, useState } from 'react';

import { getClientLogger } from '../../clientLogger';
import { backendClientHooks } from '../../services/serviceHooks';
import { DatasetRecordType, type Dataset, type DatasetRecord } from '../../types/datasets';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { serializeRecordsToAccessionsInput, validateAccessionByType } from '../../utils/parseAccessionInput';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';
import CheckIcon from '~icons/ic/baseline-check-circle-outline';
import ErrorIcon from '~icons/ic/baseline-error';
import ExpandMoreIcon from '~icons/ic/baseline-expand-more';

const logger = getClientLogger('DatasetForm');

type DatasetFormProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    editDataset?: Dataset;
    editDatasetRecords?: DatasetRecord[];
};

export const DatasetForm: FC<DatasetFormProps> = ({ clientConfig, accessToken, editDataset, editDatasetRecords }) => {
    const [datasetName, setDatasetName] = useState(editDataset?.name ?? '');
    const [datasetDescription, setDatasetDescription] = useState(editDataset?.description ?? '');
    const [accessionsInput, setAccessionsInput] = useState(serializeRecordsToAccessionsInput(editDatasetRecords));
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();
    const { createDataset, updateDataset, isLoading } = useActionHook(clientConfig, accessToken, openErrorFeedback);

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
                ...getAccessionsByType(DatasetRecordType.genbank).map((accession) => ({
                    accession,
                    type: DatasetRecordType.genbank,
                })),
                ...getAccessionsByType(DatasetRecordType.sra).map((accession) => ({
                    accession,
                    type: DatasetRecordType.sra,
                })),
                ...getAccessionsByType(DatasetRecordType.gisaid).map((accession) => ({
                    accession,
                    type: DatasetRecordType.gisaid,
                })),
            ],
        };
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const dataset = getDatasetFromInput();
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

    const getAccessionsByType = (type: DatasetRecordType) => {
        const accessions = accessionsInput[type];
        return accessions
            .split(',')
            .map((accession) => accession.trim())
            .filter(Boolean);
    };

    const renderAccessionStatus = (accession: string, type: DatasetRecordType) => {
        const status = validateAccessionByType(accession, type);
        return status ? <CheckIcon /> : <ErrorIcon />;
    };

    return (
        <div className='flex flex-col items-center  overflow-auto-y w-full'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
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
                        inputProps={{ maxLength: 100 }}
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
                        inputProps={{ maxLength: 300 }}
                    />
                </FormControl>
                <h2 className='text-lg font-bold'>Accessions</h2>
                <FormGroup>
                    {Object.keys(accessionsInput).map((type) => (
                        <Accordion defaultExpanded={type === DatasetRecordType.loculus} key={`${type}-accordian`}>
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon />}
                                aria-controls={`${type}-content`}
                                id={`${type}-header`}
                            >
                                {`${type}`}
                            </AccordionSummary>
                            <AccordionDetails>
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
                                            value={accessionsInput[type as DatasetRecordType]}
                                            onChange={(event: any) =>
                                                setAccessionInput(event.target.value, type as DatasetRecordType)
                                            }
                                            inputProps={{ maxLength: 1000 }}
                                        />
                                        <FormHelperText id='outlined-weight-helper-text'>
                                            {`Enter a list of comma-separated ${type} accessions.`}
                                        </FormHelperText>
                                    </FormControl>
                                </div>
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </FormGroup>
                <div className='p-6 space-y-6 max-w-md w-full'>
                    <div>
                        {Object.values(DatasetRecordType).map((type) =>
                            getAccessionsByType(type as DatasetRecordType).map((accession) => (
                                <div key={accession} className='flex flex-row justify-between'>
                                    <div>{accession}</div>
                                    {renderAccessionStatus(accession, type as DatasetRecordType)}
                                </div>
                            )),
                        )}
                    </div>
                    <FormHelperText id='outlined-weight-helper-text'>Validated accessions</FormHelperText>
                </div>
            </div>
            <Button className='flex items-center' variant='outlined' disabled={isLoading} onClick={handleSubmit}>
                {isLoading ? <CircularProgress size={20} color='primary' /> : 'Save'}
            </Button>
        </div>
    );
};

function useActionHook(clientConfig: ClientConfig, accessToken: string, openErrorFeedback: (message: string) => void) {
    const hooks = backendClientHooks(clientConfig);
    const create = hooks.useCreateDataset(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async (response) => {
                await logger.info(`Successfully created dataset with datasetId: ${response.datasetId}`);
                const redirectUrl = `/datasets/${response.datasetId}?version=${response.datasetVersion}`;
                location.href = redirectUrl;
            },
            onError: async (error) => {
                const message = `Failed to create dataset. Error: '${JSON.stringify(error)})}'`;
                await logger.info(message);
                openErrorFeedback(message);
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
                const message = `Failed to update dataset with datasetId. Error: '${JSON.stringify(error)})}'`;
                await logger.info(message);
                openErrorFeedback(message);
            },
        },
    );
    return {
        createDataset: create.mutate,
        updateDataset: update.mutate,
        isLoading: create.isLoading || update.isLoading,
    };
}
