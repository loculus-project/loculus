import Snackbar from '@mui/material/Snackbar';
import { type FC, useState } from 'react';

import type { Dataset, DatasetRecord } from '../../types/datasetCitation';

type ExportDatasetProps = {
    dataset: Dataset;
    datasetRecords: DatasetRecord[];
};

export const ExportDataset: FC<ExportDatasetProps> = ({ dataset, datasetRecords }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isCopyAlertOpen, setIsCopyAlertOpen] = useState(false);
    const [selectedDownload, setSelectedDownload] = useState(0);
    const [selectedCitation, setSelectedCitation] = useState(0);

    const formatYear = (date: string) => {
        const dateObj = new Date(date);
        return dateObj.getFullYear();
    };

    const getDatasetURL = () => {
        return dataset.datasetDOI === null || dataset.datasetDOI === undefined
            ? window.location.href
            : `https://doi.org/10.62599/${dataset.datasetDOI}`;
    };

    const downloadJSONDataset = () => {
        const exportData = {
            dataset,
            sequences: datasetRecords,
        };
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData));
        const hiddenLink = document.createElement('a');
        hiddenLink.href = dataStr;
        hiddenLink.download = `${dataset.name}.json`;
        hiddenLink.click();
    };

    const downloadTSVDataset = () => {
        const headers = [...Object.keys(dataset), 'accessions'];
        const datasetString = Object.values(dataset).join('\t');
        const accessionsString = datasetRecords.map((record) => record.accession).join(', ');
        const tsv = [headers.join('\t'), datasetString + '\t' + accessionsString].join('\r\n');
        const dataStr = 'data:text/tsv;charset=utf-8,' + encodeURIComponent(tsv);
        const hiddenLink = document.createElement('a');
        hiddenLink.href = dataStr;
        hiddenLink.download = `${dataset.name}.tsv`;
        hiddenLink.click();
    };

    const downloadDataset = () => {
        setIsDownloading(true);
        if (selectedDownload === 0) {
            downloadJSONDataset();
        } else if (selectedDownload === 1) {
            downloadTSVDataset();
        }
        setIsDownloading(false);
    };

    const getBibtex = () => {
        return `@online{${dataset.name.replace(/\s/g, '_')},
    author = {${dataset.createdBy}},
    title = {${dataset.name}},
    year = {${formatYear(dataset.createdAt)}},
    url = {${getDatasetURL()}},${dataset.datasetDOI === null || dataset.datasetDOI === undefined ? '' : `\n\tdoi = {${dataset.datasetDOI}},`}
}`;
    };

    const getMLACitation = () => {
        return `${dataset.createdBy}. ${dataset.name}, ${formatYear(dataset.createdAt)}. ${getDatasetURL()}`;
    };

    const getAPACitation = () => {
        return `${dataset.createdBy} (${formatYear(dataset.createdAt)}). ${dataset.name} (${dataset.datasetVersion}). ${getDatasetURL()}`;
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
        setIsCopyAlertOpen(true);
        const citationText = getSelectedCitationText();
        await navigator.clipboard.writeText(citationText);
    };

    return (
        <div className='flex flex-col flex-start items-center w-full'>
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold'>Export</h1>
            </div>
            <Snackbar
                open={isCopyAlertOpen}
                onClose={() => setIsCopyAlertOpen(false)}
                autoHideDuration={2000}
                message='Copied to clipboard'
            />
            <div className='flex flex-col justify-around max-w-md w-2/4'>
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
                        <button className='btn' onClick={downloadDataset} disabled={isDownloading}>
                            Download
                        </button>
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
                    />
                </div>
                <div className='pb-8'>
                    <button className='btn' onClick={copyToClipboard} disabled={isDownloading}>
                        Copy to clipboard
                    </button>
                </div>
            </div>
        </div>
    );
};
