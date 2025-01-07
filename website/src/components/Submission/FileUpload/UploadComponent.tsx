import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';

import type { FileKind, ProcessedFile } from './fileProcessing.ts';
import useClientFlag from '../../../hooks/isClient.ts';

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
            let processedFile: ProcessedFile | null = null;
            if (file !== null) {
                const processingResult = await fileKind.processRawFile(file);
                processedFile = processingResult.match(
                    (value) => {
                        if (value.warnings().length) {
                            toast.warn(value.warnings().join(' '));
                        }
                        return value;
                    },
                    (error) => {
                        toast.error(error.message, { autoClose: false });
                        return null;
                    },
                );
            }
            setFile(processedFile !== null ? processedFile.inner() : null);
            rawSetMyFile(processedFile);
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
