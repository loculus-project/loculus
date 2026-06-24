import { type FC, type FormEvent, useEffect, useState } from 'react';

import { InputModeTabs } from './DataUploadForm.tsx';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import { type Group } from '../../types/backend.ts';
import type { InputField, SubmissionDataTypes } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { EditPage } from '../Edit/EditPage.tsx';
import { Button } from '../common/Button';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type InlineRevisionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
};

const parseAccessionVersion = (raw: string): { accession: string; version: number } | undefined => {
    const trimmed = raw.trim();
    const match = /^(.+)\.(\d+)$/.exec(trimmed);
    if (!match) return undefined;
    return { accession: match[1], version: Number(match[2]) };
};

const InnerInlineRevisionForm: FC<InlineRevisionFormProps> = ({
    accessToken,
    organism,
    clientConfig,
    group,
    metadataTemplateFields,
    submissionDataTypes,
}) => {
    const [input, setInput] = useState('');
    const [searched, setSearched] = useState<{ accession: string; version: number } | undefined>(undefined);
    const [parseError, setParseError] = useState<string | undefined>(undefined);

    useEffect(() => {
        const accessionVersionParam = new URLSearchParams(window.location.search).get('accessionVersion');
        if (!accessionVersionParam) return;
        const parsed = parseAccessionVersion(accessionVersionParam);
        if (parsed) {
            setInput(accessionVersionParam);
            setSearched(parsed);
        }
    }, []);

    const { data, error, isFetching } = backendClientHooks(clientConfig).useGetDataToEdit(
        {
            headers: createAuthorizationHeader(accessToken),
            params: {
                organism,
                accession: searched?.accession ?? '',
                version: searched?.version ?? 1,
            },
        },
        { enabled: searched !== undefined },
    );

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const parsed = parseAccessionVersion(input);
        if (!parsed) {
            setParseError('Enter an accession with version, e.g. LOC_0001234.1');
            setSearched(undefined);
            return;
        }
        setParseError(undefined);
        setSearched(parsed);
        const url = new URL(window.location.href);
        url.searchParams.set('accessionVersion', input.trim());
        window.history.replaceState(null, '', url.toString());
    };

    return (
        <div className='text-left mt-3 max-w-4xl mb-3 w-full'>
            <div className='flex-col flex gap-8'>
                <h1 className='title'>Revise sequences</h1>
                <InputModeTabs action='revise' organism={organism} groupId={group.groupId} currentInputMode='form' />
                <form className='flex flex-col gap-2' onSubmit={handleSubmit}>
                    <label htmlFor='revise-accession-input' className='text-sm font-medium text-gray-900'>
                        Accession of sequence to revise
                    </label>
                    <div className='flex gap-2'>
                        <input
                            id='revise-accession-input'
                            type='text'
                            className='border border-gray-300 rounded px-3 py-2 w-80'
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder='e.g. LOC_0001234.1'
                        />
                        <Button
                            type='submit'
                            className='rounded-md px-4 py-2 text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500'
                            alsoDisabledIf={isFetching}
                        >
                            {isFetching ? 'Loading…' : 'Find sequence entry'}
                        </Button>
                    </div>
                    {parseError && <p className='text-sm text-red-600'>{parseError}</p>}
                    {error && (
                        <p className='text-sm text-red-600'>
                            Could not load that sequence. Make sure the accession belongs to your group.
                        </p>
                    )}
                </form>
                {data && (
                    <div>
                        <EditPage
                            key={`${data.accession}.${data.version}`}
                            organism={organism}
                            accessToken={accessToken}
                            clientConfig={clientConfig}
                            dataToEdit={data}
                            groupedInputFields={metadataTemplateFields}
                            submissionDataTypes={submissionDataTypes}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export const InlineRevisionForm = withQueryProvider(InnerInlineRevisionForm);
