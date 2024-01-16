import { type FC, type FormEvent, useState, useEffect } from 'react';
import ExpandMoreIcon from '~icons/ic/baseline-expand-more';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import TextField from '@mui/material/TextField';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';
import { backendClientHooks } from '../../services/serviceHooks';
import { getClientLogger } from '../../clientLogger';
import { AccessionType, type Dataset, type DatasetRecord } from '../../types/datasets';
import type { ClientConfig } from '../../types/runtimeConfig';
import { serializeRecordsToAccessionsInput, parseRecordsFromAccessionInput } from '../../utils/parseAccessionInput';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';

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
    const [datasetRecords, setDatasetRecords] = useState(editDatasetRecords);
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();
    const { createDataset, updateDataset, isLoading } = useActionHook(clientConfig, accessToken, openErrorFeedback);

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

    const setAccessionInput = (accessionInput: string, type: AccessionType) => {
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
                ...getAccessionsList(AccessionType.loculus).map((accession) => ({
                    accession,
                    type: AccessionType.loculus,
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
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const dataset = getDatasetFromInput();
        if (editDataset !== undefined) {
            updateDataset({
                datasetId: editDataset?.datasetId,
                ...dataset,
            });
        } else {
            createDataset(dataset);
        }
        return;
    };

    const getAccessionsList = (type: AccessionType) => {
        const accessions = accessionsInput[type];
        return accessions
            .split(',')
            .map((accession) => accession.trim())
            .filter(Boolean);
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
                        <Accordion defaultExpanded={type === AccessionType.loculus} key={`${type}-accordian`}>
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
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </FormGroup>
                <Button variant='outlined' disabled={isLoading} onClick={handleSubmit}>
                    {isLoading ? <CircularProgress size={20} color='primary' /> : 'Save'}
                </Button>
            </div>
        </div>
    );
};


function useActionHook(clientConfig: ClientConfig, accessToken: string, openErrorFeedback: (message: string) => void) {
    const hooks = backendClientHooks(clientConfig)
    const create = hooks.useCreateDataset(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onSuccess: async (response) => {
                await logger.info(`Successfully created dataset with datasetId: ${response?.datasetId}`);
                const redirectUrl = `/datasets/${response?.datasetId}?version=${response?.datasetVersion}`;
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
                await logger.info(`Successfully updated dataset with datasetId: ${response?.datasetId}`);
                const redirectUrl = `/datasets/${response?.datasetId}?version=${response?.datasetVersion}`;
                location.href = redirectUrl;
            },
            onError: async (error) => {
                const message = `Failed to update dataset with datasetId. Error: '${JSON.stringify(
                    error,
                )})}'`;
                await logger.info(message);
                openErrorFeedback(message);
            },
        },
    );
    return {
        createDataset: create.mutate,
        updateDataset: update.mutate,
        isLoading: create.isLoading || update.isLoading,
    }
}
