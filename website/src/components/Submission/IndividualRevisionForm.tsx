import { type FC, type FormEvent, useState } from 'react';

import { InputModeTabs } from './DataUploadForm.tsx';
import { routes } from '../../routes/routes.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import { type AccessionVersion, type Group } from '../../types/backend.ts';
import type { InputField, SubmissionDataTypes } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { parseAccessionVersionFromString } from '../../utils/extractAccessionVersion.ts';
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
    accessionVersion?: string;
};

const RevisionInfo: FC<{
    organism: string;
    group: Group;
}> = ({ organism, group }) => {
    return (
        <div className='text-gray-600 space-y-2'>
            <p>
                To find the sequence entry you wish to revise, you can browse your group's{' '}
                <a href={routes.mySequencesPage(organism, group.groupId)} className='text-primary-600 hover:underline'>
                    Released sequences
                </a>{' '}
                page.
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
    input: string | undefined;
    setInput: (value: string | undefined) => void;
    handleSubmit: (e: FormEvent) => void;
    error?: string;
    isFetching: boolean;
}> = ({ input, setInput, handleSubmit, error, isFetching }) => {
    return (
        <form className='flex flex-col gap-2' onSubmit={handleSubmit}>
            <label htmlFor='revise-accession-input' className='text-sm font-medium text-gray-900'>
                Accession and version of sequence to revise
            </label>
            <div className='flex gap-2'>
                <input
                    id='revise-accession-input'
                    type='text'
                    className='border border-gray-300 rounded px-3 py-2 w-80'
                    value={input ?? ''}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder='LOC_0001234.1'
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

const InnerIndividualRevisionForm: FC<IndividualRevisionFormProps> = ({
    accessToken,
    organism,
    clientConfig,
    group,
    metadataTemplateFields,
    submissionDataTypes,
    accessionVersion,
}) => {
    const getValidAccessionVersion = (value: string | undefined) => {
        const parsed = parseAccessionVersionFromString(value?.trim() ?? '');
        if (parsed.version === undefined) {
            return undefined;
        }
        return parsed as AccessionVersion;
    };

    const [input, setInput] = useState<string | undefined>(accessionVersion);
    const [search, setSearch] = useState<AccessionVersion | undefined>(getValidAccessionVersion(accessionVersion));

    const {
        data,
        error: apiError,
        isFetching,
    } = backendClientHooks(clientConfig).useGetDataToEdit(
        {
            headers: createAuthorizationHeader(accessToken),
            params: {
                organism,
                accession: search?.accession ?? '',
                version: search?.version ?? 1,
            },
        },
        { enabled: search !== undefined },
    );

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();

        const value = input?.trim();
        const url = new URL(window.location.href);
        if (!value) url.searchParams.delete('accessionVersion');
        else url.searchParams.set('accessionVersion', value);
        window.history.replaceState(null, '', url.toString());

        setSearch(getValidAccessionVersion(value));
    };

    const parseError =
        !input?.trim() || getValidAccessionVersion(input)
            ? undefined
            : 'Please enter an accession and version, e.g. LOC_0001234.1';

    const error =
        parseError ??
        (apiError ? 'Could not load that sequence. Make sure the accession belongs to your group.' : undefined);

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
                        isFetching={isFetching}
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
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export const IndividualRevisionForm = withQueryProvider(InnerIndividualRevisionForm);
