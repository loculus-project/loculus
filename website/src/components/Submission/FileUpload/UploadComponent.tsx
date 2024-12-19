import { useCallback, useEffect, useRef, useState, type SVGProps, type ForwardRefExoticComponent } from 'react';
import * as XLSX from 'xlsx';

import useClientFlag from '../../../hooks/isClient.ts';
import MaterialSymbolsLightDataTableOutline from '~icons/material-symbols-light/data-table-outline';
import PhDnaLight from '~icons/ph/dna-light';
import { toast } from 'react-toastify';

type Icon = ForwardRefExoticComponent<SVGProps<SVGSVGElement>>;

type FileKind = {
    type: 'metadata' | 'fasta';
    icon: Icon;
    supportedExtensions: string[];
    processRawFile: (file: File) => Promise<ProcessedFile | Error>;
};

export const METADATA_FILE_KIND: FileKind = {
    type: 'metadata',
    icon: MaterialSymbolsLightDataTableOutline,
    supportedExtensions: ['tsv', 'xlsx', 'xls'],
    processRawFile: async (file: File) => {
        switch (file.type) {
            case 'application/vnd.ms-excel':
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                const f = new ExcelFile(file);
                try {
                    await f.init();
                } catch (err) {
                    return err as Error;
                }
                return f;
            }
            default:
                return new RawFile(file);
        }
    },
};

export const FASTA_FILE_KIND: FileKind = {
    type: 'fasta',
    icon: PhDnaLight,
    supportedExtensions: ['fasta'],
    processRawFile: (file) => Promise.resolve(new RawFile(file)),
};

interface ProcessedFile {
    /* The file containing the data (might be processed, only exists in memory) */
    inner(): File;

    /* The handle to the file on disk. */
    handle(): File;
}

class RawFile implements ProcessedFile {
    private innerFile: File;

    constructor(file: File) {
        this.innerFile = file;
    }

    inner(): File {
        return this.innerFile;
    }
    handle(): File {
        return this.innerFile;
    }
}

class ExcelFile implements ProcessedFile {
    private originalFile: File;
    private tsvFile: File | undefined;

    constructor(excelFile: File) {
        // assumes that the given file is actually an execel file.
        this.originalFile = excelFile;
    }

    async init() {
        const arrayBuffer = await this.originalFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {
            type: 'array',
            cellDates: true, // parse date cells into actual date objects (as opposed to numbers)
            dateNF: 'yyyy-mm-dd', // use this format to 'render' date cells
        });

        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const tsvContent = XLSX.utils.sheet_to_csv(sheet, {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            FS: '\t',
            blankrows: false,
        });
        const rowCount = tsvContent.split('\n').length - 1;
        if (rowCount <= 0) {
            throw new Error(`Sheet ${firstSheetName} is empty.`)
        }
        /* eslint-disable no-console */
        console.log("SHEET NAMES:")
        console.log(JSON.stringify(workbook.SheetNames));
        console.log('-----------------------------------');
        console.log(tsvContent);
        console.log('-----------------------------------');
        /* eslint-enable no-console */

        const tsvBlob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
        const tsvFile = new File([tsvBlob], 'converted.tsv', { type: 'text/tab-separated-values' });
        this.tsvFile = tsvFile;
    }

    inner(): File {
        if (this.tsvFile === undefined) {
            throw new Error('file was not initialized');
        }
        return this.tsvFile;
    }

    handle(): File {
        return this.originalFile;
    }
}

export const UploadComponent = ({
    setFile,
    name,
    ariaLabel,
    fileKind,
}: {
    setFile: (file: File | null) => void;
    name: string;
    ariaLabel: string;
    fileKind: FileKind;
}) => {
    const [myFile, rawSetMyFile] = useState<ProcessedFile | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const isClient = useClientFlag();

    const setMyFile = useCallback(
        async (file: File | null) => {
            var processingResult = file !== null ? await fileKind.processRawFile(file) : null;
            if (processingResult instanceof Error) {
                toast.error(processingResult.message, { position: 'top-center', autoClose: false });
                processingResult = null;
            }
            setFile(processingResult ? processingResult.inner() : null);
            rawSetMyFile(processingResult);
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
            myFile
                ?.handle()
                .slice(0, 1)
                .arrayBuffer()
                .catch(() => {
                    void setMyFile(null);
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                });
        }, 500);

        return () => clearInterval(interval);
    }, [myFile, setMyFile]);
    return (
        <div
            className={`flex flex-col h-40 rounded-lg border ${myFile ? 'border-hidden' : 'border-dashed border-gray-900/25'} ${isDragOver && !myFile ? 'bg-green-100' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <fileKind.icon className='mx-auto mt-4 mb-0 h-12 w-12 text-gray-300' aria-hidden='true' />
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
                                    aria-label={ariaLabel}
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
                    <p className='text-sm pb+2 leading-5 text-gray-600'>
                        {fileKind.supportedExtensions.join(', ')} Files
                    </p>
                </div>
            ) : (
                <div className='flex flex-col items-center justify-center text-center flex-1 px-4 py-2'>
                    <div className='text-sm text-gray-500 mb-1'>{myFile.handle().name}</div>
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
    );
};
