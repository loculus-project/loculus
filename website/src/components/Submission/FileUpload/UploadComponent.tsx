import { type ElementType, useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

import useClientFlag from '../../../hooks/isClient.ts';

/**
 * always return a TSV file
 */
async function processFile(file: File): Promise<File> {
    switch (file.type) {
        case 'application/vnd.ms-excel':
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, {
                type: 'array',
                cellDates: true, // parse date cells into actual date objects (as opposed to numbers)
                dateNF: 'yyyy-mm-dd', // use this format to 'render' date cells
            });

            const firstSheetName = workbook.SheetNames[1];
            const sheet = workbook.Sheets[firstSheetName];
            const tsvContent = XLSX.utils.sheet_to_csv(sheet, {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                FS: '\t',
                blankrows: false,
            });
            /* eslint-disable no-console */
            console.log('-----------------------------------');
            console.log(tsvContent);
            console.log('-----------------------------------');
            /* eslint-enable no-console */

            const tsvBlob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
            // TODO -> now if the underlying data changes, the converted file won't update
            const tsvFile = new File([tsvBlob], file.name, { type: 'text/tab-separated-values' });
            return tsvFile;
        }
        default:
            return file;
    }
}

export const UploadComponent = ({
    setFile,
    name,
    title,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Icon,
    fileType,
}: {
    setFile: (file: File | null) => void;
    name: string;
    title: string;
    Icon: ElementType; // eslint-disable-line @typescript-eslint/naming-convention
    fileType: string;
}) => {
    const [myFileHandle, setMyFileHandle] = useState<File | null>(null);
    const [myFile, rawSetMyFile] = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const isClient = useClientFlag();

    const setMyFile = useCallback(
        async (file: File | null) => {
            setMyFileHandle(file);
            if (file !== null) {
                file = await processFile(file);
            }
            setFile(file);
            rawSetMyFile(file);
        },
        [setFile, rawSetMyFile],
    );
    const fileInputRef = useRef<HTMLInputElement>(null);
    const handleUpload = () => {
        document.getElementById(name)?.click();
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        void setMyFile(file);
    };

    useEffect(() => {
        const interval = setInterval(() => {
            // Check if the file is no longer readable - which generally indicates the file has been edited since being
            // selected in the UI - and if so clear it.
            myFileHandle
                ?.slice(0, 1)
                .arrayBuffer()
                .catch(() => {
                    void setMyFile(null);
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                });
        }, 500);

        return () => clearInterval(interval);
    }, [myFileHandle, setMyFile]);
    return (
        <div className='sm:col-span-4'>
            <label className='text-gray-900 font-medium text-sm block'>{title}</label>
            {name === 'metadata_file' && (
                <div>
                    <span className='text-gray-500 text-xs'>
                        The documentation pages contain more details on the required
                    </span>
                    <a href='/docs/concepts/metadataformat' className='text-primary-700 text-xs'>
                        {' '}
                        metadata format{' '}
                    </a>
                </div>
            )}
            <div
                className={`mt-2 flex flex-col h-40 rounded-lg border ${myFile ? 'border-hidden' : 'border-dashed border-gray-900/25'} ${isDragOver && !myFile ? 'bg-green-100' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className='flex items-center justify-center'>
                    <Icon className='mx-auto mt-4 mb-0 h-12 w-12 text-gray-300' aria-hidden='true' />
                </div>
                {!myFile ? (
                    <div className='flex flex-col items-center justify-center flex-1 px-4 py-2'>
                        <div className='text-center'>
                            <label className='inline relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500'>
                                <span
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleUpload();
                                    }}
                                >
                                    Upload
                                </span>
                                {isClient && (
                                    <input
                                        id={name}
                                        name={name}
                                        type='file'
                                        className='sr-only'
                                        aria-label={title}
                                        data-testid={name}
                                        onChange={(event) => {
                                            const file = event.target.files?.[0] ?? null;
                                            void setMyFile(file);
                                        }}
                                        ref={fileInputRef}
                                    />
                                )}
                            </label>
                            <span className='pl-1'>or drag and drop</span>
                        </div>
                        <p className='text-sm pb+2 leading-5 text-gray-600'>{fileType}</p>
                    </div>
                ) : (
                    <div className='flex flex-col items-center justify-center text-center flex-1 px-4 py-2'>
                        <div className='text-sm text-gray-500 mb-1'>{myFile.name}</div>
                        <button
                            onClick={() => void setMyFile(null)}
                            data-testid={`discard_${name}`}
                            className='text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
                        >
                            Discard file
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
