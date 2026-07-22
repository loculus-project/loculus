import { type FC, type FormEvent, useState } from 'react';
import { toast } from 'react-toastify';

import useClientFlag from '../../hooks/isClient';
import { BackendClient } from '../../services/backendClient';
import type { ClientConfig } from '../../types/runtimeConfig';
import type { AdminSeqSetCitation } from '../../types/seqSetCitation';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';

interface Props {
    clientConfig: ClientConfig;
    accessToken: string;
    onCitationAdded: (citation: AdminSeqSetCitation) => void;
}

const splitLines = (value: string) =>
    value
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

const splitAccessions = (value: string) =>
    value
        .split(/[\s,]+/)
        .map((accession) => accession.trim())
        .filter((accession) => accession.length > 0);

const parseContributor = (line: string) => {
    const parts = line.split(/\s+/);
    const surname = parts[parts.length - 1];
    const givenName = parts.slice(0, -1).join(' ');
    return { givenName, surname };
};

// CrossRef's REST API response uses kebab-case field names that we can't rename.
/* eslint-disable @typescript-eslint/naming-convention */
type CrossRefWork = {
    'title'?: string[];
    'container-title'?: string[];
    'author'?: { given?: string; family?: string }[];
    'issued'?: { 'date-parts'?: number[][] };
    'published'?: { 'date-parts'?: number[][] };
    'published-print'?: { 'date-parts'?: number[][] };
    'published-online'?: { 'date-parts'?: number[][] };
};
/* eslint-enable @typescript-eslint/naming-convention */

const extractYear = (work: CrossRefWork): number | undefined => {
    const candidates = [work.issued, work.published, work['published-print'], work['published-online']];
    for (const candidate of candidates) {
        const year = candidate?.['date-parts']?.[0]?.[0];
        if (typeof year === 'number') {
            return year;
        }
    }
    return undefined;
};

export const AddSeqSetCitationForm: FC<Props> = ({ clientConfig, accessToken, onCitationAdded }) => {
    const isClient = useClientFlag();
    const [sourceDOI, setSourceDOI] = useState('');
    const [title, setTitle] = useState('');
    const [journal, setJournal] = useState('');
    const [year, setYear] = useState('');
    const [contributorsInput, setContributorsInput] = useState('');
    const [seqSetAccessionsInput, setSeqSetAccessionsInput] = useState('');
    const [isPending, setIsPending] = useState(false);
    const [isFetchingDoi, setIsFetchingDoi] = useState(false);
    const [validationMessage, setValidationMessage] = useState('');

    const backendClient = new BackendClient(clientConfig.backendUrl);

    const resetForm = () => {
        setSourceDOI('');
        setTitle('');
        setJournal('');
        setYear('');
        setContributorsInput('');
        setSeqSetAccessionsInput('');
    };

    const handleFetchFromDoi = async () => {
        const doi = sourceDOI.trim();
        if (doi === '') {
            setValidationMessage('Enter a source DOI first.');
            return;
        }
        setValidationMessage('');
        setIsFetchingDoi(true);
        try {
            const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
            if (!response.ok) {
                throw new Error(`CrossRef lookup failed (${response.status})`);
            }
            const data = (await response.json()) as { message: CrossRefWork };
            const work = data.message;

            if (work.title?.[0] !== undefined) {
                setTitle(work.title[0]);
            }
            if (work['container-title']?.[0] !== undefined) {
                setJournal(work['container-title'][0]);
            }
            const year = extractYear(work);
            if (year !== undefined) {
                setYear(String(year));
            }
            if (work.author !== undefined) {
                setContributorsInput(
                    work.author
                        .map((a) => [a.given, a.family].filter((part) => part !== undefined && part !== '').join(' '))
                        .filter((name) => name !== '')
                        .join('\n'),
                );
            }
            toast.success('Populated from CrossRef.', { position: 'top-center', autoClose: 2000 });
        } catch {
            toast.error(`Could not fetch metadata for DOI ${doi} from CrossRef.`, {
                position: 'top-center',
                autoClose: false,
            });
        } finally {
            setIsFetchingDoi(false);
        }
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setValidationMessage('');

        const seqSetAccessionVersions = splitAccessions(seqSetAccessionsInput);
        const parsedYear = Number(year);

        if (sourceDOI.trim() === '' || title.trim() === '') {
            setValidationMessage('Source DOI and title are required.');
            return;
        }
        if (year.trim() === '' || !Number.isInteger(parsedYear)) {
            setValidationMessage('Year must be a whole number.');
            return;
        }
        if (seqSetAccessionVersions.length === 0) {
            setValidationMessage('At least one cited SeqSet accession.version is required.');
            return;
        }

        setIsPending(true);
        const result = await backendClient.addSeqSetCitation(accessToken, {
            source: {
                sourceDOI: sourceDOI.trim(),
                title: title.trim(),
                year: parsedYear,
                contributors: splitLines(contributorsInput).map(parseContributor),
                journal: journal.trim() || undefined,
            },
            seqSetAccessionVersions,
        });
        setIsPending(false);

        result.match(
            (citation) => {
                onCitationAdded(citation);
                resetForm();
                toast.success('Citation added.', { position: 'top-center', autoClose: 3000 });
            },
            (error) => {
                toast.error(`Failed to add citation. ${error.title}. ${error.detail}`, {
                    position: 'top-center',
                    autoClose: false,
                });
            },
        );
    };

    const inputStyles =
        'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5';

    return (
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        <form className='max-w-lg mt-4 mb-8' onSubmit={handleSubmit}>
            <h3 className='text-lg font-semibold mb-2'>Manually add a citation</h3>
            <div className='mb-4'>
                <label htmlFor='citation-source-doi' className='block mb-1 text-sm font-medium text-gray-900'>
                    * Source DOI
                </label>
                <div className='flex gap-2'>
                    <input
                        id='citation-source-doi'
                        type='text'
                        className={inputStyles}
                        value={sourceDOI}
                        onChange={(e) => setSourceDOI(e.target.value)}
                        disabled={!isClient}
                    />
                    <Button
                        type='button'
                        variant='outline'
                        className='shrink-0 whitespace-nowrap'
                        disabled={isFetchingDoi}
                        data-testid='fetch-doi-button'
                        // eslint-disable-next-line @typescript-eslint/no-misused-promises
                        onClick={handleFetchFromDoi}
                    >
                        {isFetchingDoi ? <Spinner size='sm' /> : 'Fetch from DOI'}
                    </Button>
                </div>
                <p className='mt-1 text-xs text-gray-500'>Populates title, year, and contributors below.</p>
            </div>
            <div className='mb-4'>
                <label htmlFor='citation-title' className='block mb-1 text-sm font-medium text-gray-900'>
                    * Title
                </label>
                <input
                    id='citation-title'
                    type='text'
                    className={inputStyles}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={!isClient}
                />
            </div>
            <div className='mb-4'>
                <label htmlFor='citation-year' className='block mb-1 text-sm font-medium text-gray-900'>
                    * Year
                </label>
                <input
                    id='citation-year'
                    type='number'
                    className={inputStyles}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    disabled={!isClient}
                />
            </div>
            <div className='mb-4'>
                <label htmlFor='citation-journal' className='block mb-1 text-sm font-medium text-gray-900'>
                    Journal
                </label>
                <input
                    id='citation-journal'
                    type='text'
                    className={inputStyles}
                    value={journal}
                    onChange={(e) => setJournal(e.target.value)}
                    disabled={!isClient}
                />
            </div>
            <div className='mb-4'>
                <label htmlFor='citation-contributors' className='block mb-1 text-sm font-medium text-gray-900'>
                    Contributors (one &lsquo;Given Surname&rsquo; per line)
                </label>
                <textarea
                    id='citation-contributors'
                    className={inputStyles}
                    rows={3}
                    value={contributorsInput}
                    onChange={(e) => setContributorsInput(e.target.value)}
                    disabled={!isClient}
                />
            </div>
            <div className='mb-4'>
                <label htmlFor='citation-seqset-accessions' className='block mb-1 text-sm font-medium text-gray-900'>
                    * Cited SeqSets (accession.version, separated by comma or whitespace)
                </label>
                <textarea
                    id='citation-seqset-accessions'
                    className={inputStyles}
                    rows={2}
                    value={seqSetAccessionsInput}
                    onChange={(e) => setSeqSetAccessionsInput(e.target.value)}
                    disabled={!isClient}
                />
            </div>
            {validationMessage !== '' && <p className='mb-4 text-red-500 text-sm italic'>{validationMessage}</p>}
            <Button type='submit' variant='primary' className='flex items-center' disabled={isPending}>
                {isPending ? <Spinner size='sm' className='mr-2 relative top-1' /> : 'Add citation'}
            </Button>
        </form>
    );
};
