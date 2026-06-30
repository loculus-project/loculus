import { type FC, type FormEvent, useState } from 'react';
import { toast } from 'react-toastify';

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

export const AddSeqSetCitationForm: FC<Props> = ({ clientConfig, accessToken, onCitationAdded }) => {
    const [sourceDOI, setSourceDOI] = useState('');
    const [title, setTitle] = useState('');
    const [year, setYear] = useState('');
    const [contributorsInput, setContributorsInput] = useState('');
    const [seqSetAccessionsInput, setSeqSetAccessionsInput] = useState('');
    const [isPending, setIsPending] = useState(false);
    const [validationMessage, setValidationMessage] = useState('');

    const backendClient = new BackendClient(clientConfig.backendUrl);

    const resetForm = () => {
        setSourceDOI('');
        setTitle('');
        setYear('');
        setContributorsInput('');
        setSeqSetAccessionsInput('');
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
        if (!Number.isInteger(parsedYear)) {
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
                <input
                    id='citation-source-doi'
                    type='text'
                    className={inputStyles}
                    value={sourceDOI}
                    onChange={(e) => setSourceDOI(e.target.value)}
                />
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
                />
            </div>
            {validationMessage !== '' && <p className='mb-4 text-red-500 text-sm italic'>{validationMessage}</p>}
            <Button type='submit' variant='primary' className='flex items-center' disabled={isPending}>
                {isPending ? <Spinner size='sm' className='mr-2 relative top-1' /> : 'Add citation'}
            </Button>
        </form>
    );
};
