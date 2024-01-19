import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import { type FC, useState } from 'react';

import type { Dataset, DatasetRecord } from '../../types/datasets';

type ExportDatasetProps = {
    dataset: Dataset;
    datasetRecords: DatasetRecord[];
};

export const ExportDataset: FC<ExportDatasetProps> = ({ dataset, datasetRecords }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isCopyAlertOpen, setIsCopyAlertOpen] = useState(false);

    const formatYear = (date: string) => {
        const dateObj = new Date(date);
        return dateObj.getFullYear();
    };

    const exportDataset = () => {
        setIsDownloading(true);

        const exportData = {
            dataset,
            sequences: datasetRecords,
        };
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData));
        const hiddenLink = document.createElement('a');
        hiddenLink.href = dataStr;
        hiddenLink.download = `${dataset.name}.json`;
        hiddenLink.click();
        setIsDownloading(false);
    };

    const getBibtex = () => {
        return `@online{${dataset.name},
    author = {${dataset.createdBy}},
    title = {${dataset.name}},
    year = {${formatYear(dataset.createdAt)}},
    doi = {${dataset.datasetDOI}},
    url = {https://doi.org/placeholder/${dataset?.datasetDOI}},
}`;
    };

    const copyToClipboard = async () => {
        setIsCopyAlertOpen(true);
        const bibTex = getBibtex();
        await navigator.clipboard.writeText(bibTex);
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
                    <FormLabel component='legend'>Dataset</FormLabel>
                    <h2 className='text-lg font-bold'></h2>
                    <FormControlLabel control={<Checkbox defaultChecked />} label='JSON' />
                    <FormControlLabel disabled control={<Checkbox />} label='CSV' />
                    <FormControlLabel disabled control={<Checkbox />} label='XLSX' />
                    <div className='pb-8'>
                        <Button variant='outlined' onClick={exportDataset} disabled={isDownloading}>
                            Download
                        </Button>
                    </div>
                </div>
                <hr className='mb-8' />
                <div>
                    <FormLabel component='legend'>Citation</FormLabel>
                    <FormControlLabel control={<Checkbox defaultChecked />} label='BibTeX' />
                    <FormControlLabel disabled control={<Checkbox />} label='MLA' />
                    <FormControlLabel disabled control={<Checkbox />} label='APA' />
                </div>
                <div className='py-4 w-full'>
                    <TextField
                        id='outlined-multiline-static'
                        multiline
                        rows={4}
                        fullWidth
                        value={getBibtex()}
                        size='small'
                    />
                </div>
                <div className='pb-8'>
                    <Button variant='outlined' onClick={copyToClipboard}>
                        Copy to clipboard
                    </Button>
                </div>
            </div>
        </div>
    );
};
