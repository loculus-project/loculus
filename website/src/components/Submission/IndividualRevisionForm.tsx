import { type FC, type FormEvent, useState } from 'react';

import { InputModeTabs } from './DataUploadForm.tsx';
import { getLapisUrl } from '../../config.ts';
import { routes } from '../../routes/routes.ts';
import { backendClientHooks, useSequenceEntryHistory } from '../../services/serviceHooks.ts';
import { type Group } from '../../types/backend.ts';
import type { InputField, SubmissionDataTypes } from '../../types/config.ts';
import { getLatestAccessionVersion } from '../../types/lapis.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { getUrl } from '../../utils/getUrl.ts';
import { EditPage } from '../Edit/EditPage.tsx';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type IndividualRevisionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
    accession?: string;
    version?: string;
};

const RevisionInfo: FC<{
    organism: string;
    group: Group;
}> = ({ organism, group }) => {
    return (
        <div className='text-gray-600 space-y-2'>
            <p>
                To find the sequence entry you wish to revise, you can browse the{' '}
                <a href={routes.mySequencesPage(organism, group.groupId)} className='text-primary-600 hover:underline'>
                    Released sequences
                </a>{' '}
                page for your group.
            </p>
            <p>
                Once you have found the sequence you wish to revise, open the sequence details page and click the{' '}
                <span className='font-semibold'>Revise this sequence</span> button under{' '}
                <span className='font-semibold'>Sequence management</span> near the bottom of the page. This will
                redirect you to this form, with the current values for your sequence pre-filled. From here, you can edit
                metadata and (optionally) replace the sequence file.
            </p>
        </div>
    );
};

const AccessionVersionSearch: FC<{
    input: string;
    setInput: (value: string) => void;
    handleSubmit: (e: FormEvent) => void;
    error?: string;
    isFetching: boolean;
}> = ({ input, setInput, handleSubmit, error, isFetching }) => {
    const inputId = 'revise-accession-version-search';

    return (
        <form className='flex flex-col gap-2' onSubmit={handleSubmit}>
            <label htmlFor={inputId} className='text-sm font-medium text-gray-900'>
                Accession of sequence to revise
            </label>
            <div className='flex gap-2'>
                <input
                    id={inputId}
                    type='text'
                    className='border border-gray-300 rounded px-3 py-2 w-80'
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder='LOC_0001234'
                />
                <Button
                    type='submit'
                    className='relative rounded-md px-4 py-2 text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500'
                    alsoDisabledIf={isFetching}
                >
                    <div className={`absolute ml-0.5 inline-flex ${isFetching ? 'visible' : 'invisible'}`}>
                        <Spinner size='sm' />
                    </div>
                    <span className='text-center mx-8'>Find sequence entry</span>
                </Button>
            </div>
            {error && <p className='text-sm text-red-600'>{error}</p>}
        </form>
    );
};

const formatAccessionVersion = (accession: string | undefined, version: string | undefined) => {
    if (accession === undefined) return '';
    return version !== undefined ? `${accession}.${version}` : accession;
};

const InnerIndividualRevisionForm: FC<IndividualRevisionFormProps> = ({
    accessToken,
    organism,
    clientConfig,
    group,
    metadataTemplateFields,
    submissionDataTypes,
    accession,
    version,
}) => {
    const [input, setInput] = useState<string>(formatAccessionVersion(accession, version));
    const [accessionVersion, setAccessionVersion] = useState<{ accession: string; version?: string } | undefined>(
        accession !== undefined ? { accession, version } : undefined,
    );

    const { data: sequenceEntryHistory, isFetching: isSequenceEntryHistoryFetching } = useSequenceEntryHistory(
        getLapisUrl(clientConfig, organism),
        accessionVersion?.accession,
    );

    // Only look up the data to edit once its confirmed the accession exists and we have a valid version.
    // If a version was not provided, resolve to the latest one.
    const resolvedVersion =
        accessionVersion?.version !== undefined
            ? Number(accessionVersion.version)
            : getLatestAccessionVersion(sequenceEntryHistory ?? [])?.version;
    const isValidAccessionVersion =
        resolvedVersion !== undefined &&
        (sequenceEntryHistory?.some((entry) => entry.version === resolvedVersion) ?? false);

    const {
        data,
        error: dataToEditError,
        isFetching: isDataToEditFetching,
    } = backendClientHooks(clientConfig).useGetDataToEdit(
        {
            headers: createAuthorizationHeader(accessToken),
            params: {
                organism,
                accession: accessionVersion?.accession ?? '',
                version: resolvedVersion ?? 1,
            },
        },
        { enabled: isValidAccessionVersion },
    );

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const value = input.trim();
        if (value === '') return;
        const [accession, version] = value.split('.');
        setAccessionVersion({ accession, version });

        const params = new URLSearchParams(window.location.search);
        params.set('accession', accession);
        if (version) params.set('version', version);
        else params.delete('version');
        window.history.replaceState(null, '', getUrl(window.location.origin, window.location.pathname, params));
    };

    const error =
        accessionVersion !== undefined && !isSequenceEntryHistoryFetching && !isValidAccessionVersion
            ? 'Could not find that sequence entry. Please check the accession and version and try again.'
            : dataToEditError
              ? 'Could not load that sequence. Make sure the accession belongs to your group.'
              : undefined;

    return (
        <div className='text-left mt-3 max-w-4xl mb-3'>
            <div className='flex-col flex gap-8'>
                <h1 className='title'>Revise sequences</h1>
                <div className='space-y-8'>
                    <InputModeTabs
                        action='revise'
                        organism={organism}
                        groupId={group.groupId}
                        currentInputMode='form'
                    />
                    <RevisionInfo organism={organism} group={group} />
                    <AccessionVersionSearch
                        input={input}
                        setInput={setInput}
                        handleSubmit={handleSubmit}
                        error={error}
                        isFetching={isSequenceEntryHistoryFetching || isDataToEditFetching}
                    />
                    {data && (
                        <EditPage
                            key={`${data.accession}.${data.version}`}
                            organism={organism}
                            accessToken={accessToken}
                            clientConfig={clientConfig}
                            dataToEdit={data}
                            groupedInputFields={metadataTemplateFields}
                            submissionDataTypes={submissionDataTypes}
                            sequenceEntryHistory={sequenceEntryHistory}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export const IndividualRevisionForm = withQueryProvider(InnerIndividualRevisionForm);
