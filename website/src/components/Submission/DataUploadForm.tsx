import { isErrorFromAlias } from '@zodios/core';
import type { AxiosError } from 'axios';
import { DateTime } from 'luxon';
import { type FormEvent, useState, type Dispatch, type SetStateAction } from 'react';

import { type FileFactory, FormOrUploadWrapper, type InputMode } from './FormOrUploadWrapper.tsx';
import { getClientLogger } from '../../clientLogger.ts';
import DataUseTermsSelector from '../../components/DataUseTerms/DataUseTermsSelector';
import useClientFlag from '../../hooks/isClient.ts';
import { SubmissionRouteUtils } from '../../routes/SubmissionRoute.ts';
import { backendApi } from '../../services/backendApi.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import {
    type DataUseTermsOption,
    type Group,
    openDataUseTermsOption,
    restrictedDataUseTermsOption,
} from '../../types/backend.ts';
import type { InputField } from '../../types/config.ts';
import type { SubmissionDataTypes } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { dateTimeInMonths } from '../../utils/DateTimeInMonths.tsx';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError.ts';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

export type UploadAction = 'submit' | 'revise';

type DataUploadFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    action: UploadAction;
    inputMode: InputMode;
    group: Group;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    metadataTemplateFields: Map<string, InputField[]>;
    onSuccess: () => void;
    onError: (message: string) => void;
    submissionDataTypes: SubmissionDataTypes;
    dataUseTermsEnabled: boolean;
};

const logger = getClientLogger('DataUploadForm');

const InnerDataUploadForm = ({
    accessToken,
    organism,
    clientConfig,
    action,
    inputMode,
    onSuccess,
    onError,
    group,
    referenceGenomeSequenceNames,
    metadataTemplateFields,
    submissionDataTypes,
    dataUseTermsEnabled,
}: DataUploadFormProps) => {
    const isClient = useClientFlag();

    const { submit, revise, isLoading } = useSubmitFiles(accessToken, organism, clientConfig, onSuccess, onError);
    const [fileFactory, setFileFactory] = useState<FileFactory | undefined>(undefined);
    const [dataUseTermsType, setDataUseTermsType] = useState<DataUseTermsOption>(openDataUseTermsOption);
    const [restrictedUntil, setRestrictedUntil] = useState<DateTime>(dateTimeInMonths(6));

    const [agreedToINSDCUploadTerms, setAgreedToINSDCUploadTerms] = useState(false);

    const [confirmedNoPII, setConfirmedNoPII] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        const sequenceDataResult = await fileFactory!();

        if (sequenceDataResult.type === 'error') {
            onError(sequenceDataResult.errorMessage);
            return;
        }

        const { metadataFile, sequenceFile } = sequenceDataResult;

        if (dataUseTermsEnabled && !confirmedNoPII) {
            onError(
                'Please confirm the data you submitted does not include restricted or personally identifiable information.',
            );
            return;
        }

        if (dataUseTermsEnabled && !agreedToINSDCUploadTerms) {
            onError('Please tick the box to agree that you will not independently submit these sequences to INSDC');
            return;
        }

        switch (action) {
            case 'submit': {
                const groupId = group.groupId;
                submit({
                    metadataFile: metadataFile,
                    sequenceFile: sequenceFile,
                    groupId,
                    dataUseTermsType,
                    restrictedUntil:
                        dataUseTermsType === restrictedDataUseTermsOption
                            ? restrictedUntil.toFormat('yyyy-MM-dd')
                            : null,
                });
                break;
            }
            case 'revise':
                revise({ metadataFile: metadataFile, sequenceFile: sequenceFile });
                break;
        }
    };

    return (
        <div className='text-left mt-3 max-w-4xl mb-3'>
            <div className='flex-col flex gap-8'>
                {action === 'submit' ? (
                    <>
                        <h1 className='title'>Submit sequences</h1>
                        <InputModeTabs organism={organism} groupId={group.groupId} currentInputMode={inputMode} />
                        <FormOrUploadWrapper
                            inputMode={inputMode}
                            setFileFactory={setFileFactory}
                            organism={organism}
                            action={action}
                            referenceGenomeSequenceNames={referenceGenomeSequenceNames}
                            metadataTemplateFields={metadataTemplateFields}
                            enableConsensusSequences={submissionDataTypes.consensusSequences}
                        />
                    </>
                ) : (
                    <FormOrUploadWrapper
                        inputMode='bulk'
                        setFileFactory={setFileFactory}
                        organism={organism}
                        action={action}
                        referenceGenomeSequenceNames={referenceGenomeSequenceNames}
                        metadataTemplateFields={metadataTemplateFields}
                        enableConsensusSequences={submissionDataTypes.consensusSequences}
                    />
                )}
                <hr />
                {action === 'submit' && dataUseTermsEnabled && (
                    <>
                        <DataUseTerms
                            dataUseTermsType={dataUseTermsType}
                            setDataUseTermsType={setDataUseTermsType}
                            restrictedUntil={restrictedUntil}
                            setRestrictedUntil={setRestrictedUntil}
                        />
                        <hr />
                    </>
                )}
                {dataUseTermsEnabled && (
                    <>
                        <Acknowledgement
                            confirmedNoPII={confirmedNoPII}
                            setConfirmedNoPII={setConfirmedNoPII}
                            agreedToINSDCUploadTerms={agreedToINSDCUploadTerms}
                            setAgreedToINSDCUploadTerms={setAgreedToINSDCUploadTerms}
                        />
                        <hr />
                    </>
                )}
                <div className='flex justify-end gap-x-6'>
                    <button
                        name='submit'
                        type='submit'
                        className='rounded-md py-2 text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 bg-primary-600 text-white hover:bg-primary-500'
                        onClick={(e) => void handleSubmit(e)}
                        disabled={isLoading || !isClient}
                    >
                        <div className={`absolute ml-1.5 inline-flex ${isLoading ? 'visible' : 'invisible'}`}>
                            <span className='loading loading-spinner loading-sm' />
                        </div>
                        <span className='flex-1 text-center mx-8'>Submit sequences</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export const DataUploadForm = withQueryProvider(InnerDataUploadForm);

const InputModeTabs = ({
    organism,
    groupId,
    currentInputMode,
}: {
    organism: string;
    groupId: number;
    currentInputMode: InputMode;
}) => {
    const inputModeUrl = (inputMode: InputMode) =>
        SubmissionRouteUtils.toUrl({
            name: 'submit',
            organism,
            groupId,
            inputMode,
        });

    return (
        <div className='flex border-b'>
            <a
                className={`py-2 px-4 border-b-2 ${
                    currentInputMode === 'bulk'
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500'
                } hover:text-primary-600`}
                href={inputModeUrl('bulk')}
            >
                Upload bulk sequences
            </a>
            <a
                className={`py-2 px-4 border-b-2 ${
                    currentInputMode === 'form'
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500'
                } hover:text-primary-600`}
                href={inputModeUrl('form')}
            >
                Submit single sequence
            </a>
        </div>
    );
};

const DataUseTerms = ({
    dataUseTermsType,
    setDataUseTermsType,
    restrictedUntil,
    setRestrictedUntil,
}: {
    dataUseTermsType: DataUseTermsOption;
    setDataUseTermsType: (dataUseTermsType: DataUseTermsOption) => void;
    restrictedUntil: DateTime;
    setRestrictedUntil: (restrictedUntil: DateTime) => void;
}) => {
    return (
        <div className='grid sm:grid-cols-3 gap-x-16 gap-y-4'>
            <div>
                <h2 className='font-medium text-lg'>Data use terms</h2>
                <p className='text-gray-500 text-sm'>Choose how your data can be used</p>
            </div>
            <div className='gap-x-6 gap-y-8 col-span-2'>
                <div className='space-y-6'>
                    <label htmlFor='username' className='block text-sm font-medium leading-6 text-gray-900'>
                        Terms of use for this data set
                    </label>
                    <div className='space-y-2'>
                        <DataUseTermsSelector
                            calendarUseModal
                            initialDataUseTermsOption={dataUseTermsType}
                            maxRestrictedUntil={dateTimeInMonths(12)}
                            setDataUseTerms={(terms) => {
                                setDataUseTermsType(terms.type);
                                if (terms.type === restrictedDataUseTermsOption) {
                                    setRestrictedUntil(DateTime.fromFormat(terms.restrictedUntil, 'yyyy-MM-dd'));
                                }
                            }}
                        />
                    </div>
                    {dataUseTermsType === openDataUseTermsOption ? (
                        <p className='text-sm'>Your data will be available on Pathoplexus under the open use terms.</p>
                    ) : (
                        <p className='text-sm'>
                            Your data will be available on Pathoplexus, under the restricted use terms until{' '}
                            {restrictedUntil.toFormat('yyyy-MM-dd')} and under the open use terms after that date.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

const Acknowledgement = ({
    confirmedNoPII,
    setConfirmedNoPII,
    agreedToINSDCUploadTerms,
    setAgreedToINSDCUploadTerms,
}: {
    confirmedNoPII: boolean;
    setConfirmedNoPII: Dispatch<SetStateAction<boolean>>;
    agreedToINSDCUploadTerms: boolean;
    setAgreedToINSDCUploadTerms: Dispatch<SetStateAction<boolean>>;
}) => {
    return (
        <div className='grid sm:grid-cols-3 gap-x-16 gap-y-4'>
            <div className=''>
                <h2 className='font-medium text-lg'>Acknowledgement</h2>
                <p className='text-gray-500 text-sm'>Acknowledge submission terms</p>
            </div>
            <div className='gap-x-6 gap-y-8 col-span-2'>
                <div>
                    <p className='block text-sm'>
                        Your data will be available on Pathoplexus, under the selected data use terms. Data with open
                        data use terms will additionally be made publicly available through the{' '}
                        <a href='https://www.insdc.org/' className='text-primary-600 hover:underline'>
                            INSDC
                        </a>{' '}
                        databases (ENA, DDBJ, NCBI).
                    </p>
                    <div className='mt-2 py-5'>
                        <label className='flex items-center'>
                            <input
                                type='checkbox'
                                name='confirmation-no-pii'
                                className='mr-3 ml-1 h-5 w-5 rounded border-gray-300 text-blue focus:ring-blue'
                                checked={confirmedNoPII}
                                onChange={() => setConfirmedNoPII(!confirmedNoPII)}
                            />
                            <div>
                                <p className='text-xs pl-4 text-gray-500'>
                                    I confirm that the data submitted is not sensitive or human-identifiable
                                </p>
                            </div>
                        </label>
                    </div>
                    <div className='mb-4 py-3'>
                        <label className='flex items-center'>
                            <input
                                type='checkbox'
                                name='confirmation-INSDC-upload-terms'
                                className='mr-3 ml-1 h-5 w-5 rounded border-gray-300 text-blue focus:ring-blue'
                                checked={agreedToINSDCUploadTerms}
                                onChange={() => setAgreedToINSDCUploadTerms(!agreedToINSDCUploadTerms)}
                            />
                            <div>
                                <p className='text-xs pl-4 text-gray-500'>
                                    I confirm I have not and will not submit this data independently to INSDC, to avoid
                                    data duplication. I agree to Loculus handling the submission of this data to INSDC.{' '}
                                    <a
                                        href='/docs/concepts/insdc-submission'
                                        className='text-primary-600 hover:underline'
                                    >
                                        Find out more.
                                    </a>
                                </p>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};

function useSubmitFiles(
    accessToken: string,
    organism: string,
    clientConfig: ClientConfig,
    onSuccess: () => void,
    onError: (message: string) => void,
) {
    const hooks = backendClientHooks(clientConfig);
    const submit = hooks.useSubmit(
        { params: { organism }, headers: createAuthorizationHeader(accessToken) },
        { onSuccess, onError: handleError(onError, 'submit') },
    );
    const revise = hooks.useRevise(
        { params: { organism }, headers: createAuthorizationHeader(accessToken) },
        { onSuccess, onError: handleError(onError, 'revise') },
    );

    return {
        submit: submit.mutate,
        revise: revise.mutate,
        isLoading: submit.isLoading || revise.isLoading,
    };
}

function handleError(onError: (message: string) => void, action: UploadAction) {
    return (error: unknown | AxiosError) => {
        void logger.error(`Received error from backend: ${stringifyMaybeAxiosError(error)}`);
        if (isErrorFromAlias(backendApi, action, error)) {
            switch (error.response.status) {
                case 400:
                    onError('Failed to submit sequence entries: ' + error.response.data.detail);
                    return;
                case 422:
                    onError('The submitted file content was invalid: ' + error.response.data.detail);
                    return;
                default:
                    onError(error.response.data.title + ': ' + error.response.data.detail);
                    return;
            }
        }
        onError('Received unexpected message from backend: ' + stringifyMaybeAxiosError(error));
    };
}
