import { type FC, useState } from 'react';

import type { SeqSet, SeqSetRecord } from '../../types/seqSetCitation';
import { serializeSeqSetRecords } from '../../utils/parseAccessionInput';
import { Button } from '../common/Button';

type ExportSeqSetProps = {
    seqSet: SeqSet;
    seqSetRecords: SeqSetRecord[];
};

export const ExportSeqSet: FC<ExportSeqSetProps> = ({ seqSet, seqSetRecords }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [selectedDownload, setSelectedDownload] = useState(0);

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

    return (
        <div className='flex flex-col items-center w-full'>
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold py-4'>Export SeqSet</h1>
            </div>
            <div className='flex flex-col justify-around max-w-lg'>
                <div className='flex'>
                    <div className='flex items-center me-4'>
                        <input
                            id='json-radio'
                            data-testid='json-radio'
                            checked={selectedDownload === 0}
                            type='radio'
                            className='h-4 w-4 p-2 text-primary-600 border-gray-300 checked:border-primary-600 focus:ring-primary-600 inline-block'
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
                            className='h-4 w-4 p-2 text-primary-600 border-gray-300 checked:border-primary-600 focus:ring-primary-600 inline-block'
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
                    <Button variant='primary' onClick={downloadSeqSet} disabled={isDownloading}>
                        Download
                    </Button>
                </div>
            </div>
        </div>
    );
};
