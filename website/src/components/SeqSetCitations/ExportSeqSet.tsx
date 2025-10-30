import { type FC, useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from "src/components/common/Button";

import type { SeqSet, SeqSetRecord } from '../../types/seqSetCitation';
import { serializeSeqSetRecords } from '../../utils/parseAccessionInput';

type ExportSeqSetProps = {
    seqSet: SeqSet;
    seqSetRecords: SeqSetRecord[];
    databaseName: string;
};

export const ExportSeqSet: FC<ExportSeqSetProps> = ({ seqSet, seqSetRecords, databaseName }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [selectedDownload, setSelectedDownload] = useState(0);
    const [selectedCitation, setSelectedCitation] = useState(0);

    const formatYear = (date: string) => {
        const dateObj = new Date(date);
        return dateObj.getFullYear();
    };

    const getSeqSetURL = () => {
        return seqSet.seqSetDOI === null || seqSet.seqSetDOI === undefined
            ? window.location.href
            : `https://doi.org/${seqSet.seqSetDOI}`;
    };

    const downloadJSONSeqSet = () => {
        const exportData = {
            seqSet,
            sequences: seqSetRecords,
        };
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData));
        const hiddenLink = document.createElement('a');
        hiddenLink.href = dataStr;
        hiddenLink.download = `${seqSet.name}.json`;
        hiddenLink.click();
    };

    const downloadTSVSeqSet = () => {
        const headers = [...Object.keys(seqSet), 'focalAccessions', 'backgroundAccessions'];
        const seqSetString = Object.values(seqSet).join('\t');
        const focalAccessionsString = serializeSeqSetRecords(seqSetRecords, true);
        const backgroundAccessionsString = serializeSeqSetRecords(seqSetRecords, false);
        const tsv = [
            headers.join('\t'),
            seqSetString + '\t' + focalAccessionsString + '\t' + backgroundAccessionsString,
        ].join('\r\n');
        const dataStr = 'data:text/tsv;charset=utf-8,' + encodeURIComponent(tsv);
        const hiddenLink = document.createElement('a');
        hiddenLink.href = dataStr;
        hiddenLink.download = `${seqSet.name}.tsv`;
        hiddenLink.click();
    };

    const downloadSeqSet = () => {
        setIsDownloading(true);
        if (selectedDownload === 0) {
            downloadJSONSeqSet();
        } else if (selectedDownload === 1) {
            downloadTSVSeqSet();
        }
        setIsDownloading(false);
    };

    const getBibtex = () => {
        const citationKey = (seqSet.seqSetDOI ?? `${seqSet.seqSetId}.${seqSet.seqSetVersion}`).replace(/[^\w]/g, '_');
        const fields = [
            `title = {SeqSet: ${seqSet.name}}`,
            `journal = {${databaseName}}`,
            `year = {${formatYear(seqSet.createdAt)}}`,
            `url = {${getSeqSetURL()}}`,
        ];

        if (seqSet.seqSetDOI !== null && seqSet.seqSetDOI !== undefined) {
            fields.push(`doi = {${seqSet.seqSetDOI}}`);
        }

        return `@dataset{${citationKey},\n\t${fields.join(',\n\t')}\n}`;
    };

    const getMLACitation = () => {
        return `SeqSet: ${seqSet.name}. ${databaseName}, ${formatYear(seqSet.createdAt)}. ${getSeqSetURL()}`;
    };

    const getAPACitation = () => {
        return `SeqSet: ${seqSet.name}. (${formatYear(seqSet.createdAt)}). ${databaseName}. ${getSeqSetURL()}`;
    };

    const getSelectedCitationText = () => {
        if (selectedCitation === 0) {
            return getBibtex();
        }
        if (selectedCitation === 1) {
            return getMLACitation();
        }
        return getAPACitation();
    };

    const copyToClipboard = async () => {
        const citationText = getSelectedCitationText();
        await navigator.clipboard.writeText(citationText);
        toast.success('Copied to clipboard', {
            position: 'bottom-center',
            autoClose: 2000,
        });
    };

    return (
        <div className='flex flex-col flex-start items-center w-full'>
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold'>Export</h1>
            </div>
            <div className='flex flex-col justify-around max-w-lg w-2/4'>
                <div>
                    <div className='flex'>
                        <div className='flex items-center me-4'>
                            <input
                                id='json-radio'
                                data-testid='json-radio'
                                checked={selectedDownload === 0}
                                type='radio'
                                className='w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                                onChange={() => setSelectedDownload(0)}
                            />
                            <label
                                htmlFor='json-radio'
                                className='ms-2 text-sm font-medium text-gray-900 dark:text-gray-300'
                            >
                                JSON
                            </label>
                        </div>
                        <div className='flex items-center me-4'>
                            <input
                                id='tsv-radio'
                                data-testid='tsv-radio'
                                type='radio'
                                checked={selectedDownload === 1}
                                className='w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                                onChange={() => setSelectedDownload(1)}
                            />
                            <label
                                htmlFor='tsv-radio'
                                className='ms-2 text-sm font-medium text-gray-900 dark:text-gray-300'
                            >
                                TSV
                            </label>
                        </div>
                    </div>
                    <div className='pb-8 pt-4'>
                        <Button className='btn' onClick={downloadSeqSet} disabled={isDownloading}>
                            Download
                        </Button>
                    </div>
                </div>
                <hr className='mb-8' />
                <div className='flex'>
                    <div className='flex items-center me-4'>
                        <input
                            id='bibtex-radio'
                            checked={selectedCitation === 0}
                            type='radio'
                            name='inline-radio-group'
                            className='w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                            onChange={() => setSelectedCitation(0)}
                        />
                        <label
                            htmlFor='bibtex-radio'
                            className='ms-2 text-sm font-medium text-gray-900 dark:text-gray-300'
                        >
                            BibTeX
                        </label>
                    </div>
                    <div className='flex items-center me-4'>
                        <input
                            id='mla-radio'
                            type='radio'
                            checked={selectedCitation === 1}
                            name='inline-radio-group'
                            className='w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                            onChange={() => setSelectedCitation(1)}
                        />
                        <label
                            htmlFor='mla-radio'
                            className='ms-2 text-sm font-medium text-gray-900 dark:text-gray-300'
                        >
                            MLA
                        </label>
                    </div>
                    <div className='flex items-center me-4'>
                        <input
                            id='apa-radio'
                            type='radio'
                            checked={selectedCitation === 2}
                            name='inline-radio-group'
                            className='w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                            onChange={() => setSelectedCitation(2)}
                        />
                        <label
                            htmlFor='apa-radio'
                            className='ms-2 text-sm font-medium text-gray-900 dark:text-gray-300'
                        >
                            APA
                        </label>
                    </div>
                </div>

                <div className='py-4 w-full'>
                    <textarea
                        id='citation-text'
                        className='block w-full p-4 text-gray-900 border border-gray-300 rounded-lg bg-gray-50 text-base focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
                        rows={5}
                        cols={40}
                        value={getSelectedCitationText()}
                        readOnly
                    />
                </div>
                <div className='pb-8'>
                    <Button className='btn' onClick={() => void copyToClipboard()} disabled={isDownloading}>
                        Copy to clipboard
                    </Button>
                </div>
            </div>
        </div>
    );
};
