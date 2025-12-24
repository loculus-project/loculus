import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';

import type { FileKind, ProcessedFile } from './fileProcessing.ts';
import useClientFlag from '../../../hooks/isClient.ts';
import { Button } from '../../common/Button';
import IcBaselineDownload from '~icons/ic/baseline-download';
import UndoTwoToneIcon from '~icons/ic/twotone-undo';

export const FileUploadComponent = <F extends ProcessedFile>({
    setFile,
    name,
    ariaLabel,
    fileKind,
    small = false,
    initialValue,
    showUndo = false,
    onDownload,
    downloadDisabled = false,
}: {
    setFile: (file: F | undefined) => Promise<void> | void;
    name: string;
    ariaLabel: string;
    fileKind: FileKind<F>;
    small?: boolean;
    initialValue?: F;
    showUndo?: boolean;
    onDownload?: () => void;
    downloadDisabled?: boolean;
}) => {
    const [myFile, rawSetMyFile] = useState<F | undefined>(initialValue);
    const [isDragOver, setIsDragOver] = useState(false);
    const isClient = useClientFlag();

    const [isEdited, setIsEdited] = useState(false);

    const setMyFile = useCallback(
        async (file: File | null) => {
            let processedFile: F | undefined = undefined;
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
                        if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                        }
                        return undefined;
                    },
                );
            }
            await setFile(processedFile);
            rawSetMyFile(processedFile);
            // update edited state
            if (processedFile === undefined && initialValue !== undefined) {
                setIsEdited(true);
            } else if (processedFile !== undefined && initialValue === undefined) {
                setIsEdited(true);
            } else if (processedFile === undefined && initialValue === undefined) {
                setIsEdited(false);
            } else {
                const initialText = await initialValue!.text();
                const currentText = await processedFile!.text();
                setIsEdited(initialText !== currentText);
            }
        },
        [setFile, rawSetMyFile],
    );
    const reset = async () => {
        await setFile(initialValue);
        rawSetMyFile(initialValue);
        setIsEdited(false);
    };

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
            className={`flex flex-col ${small ? 'h-24' : 'h-40'} w-full rounded-lg border ${myFile ? 'border-hidden' : 'border-dashed border-gray-900/25'} ${isDragOver && !myFile ? 'bg-green-100' : ''} relative`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {small ? (
                <fileKind.icon className='mx-auto mt-2 mb-0 h-8 w-8 text-gray-300' aria-hidden='true' />
            ) : (
                <fileKind.icon className='mx-auto mt-4 mb-0 h-12 w-12 text-gray-300' aria-hidden='true' />
            )}
            {!myFile ? (
                <div className={`flex flex-col items-center justify-center flex-1 py-2 px-4`}>
                    <div>
                        <label className='inline cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500'>
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
                        {fileKind.supportedExtensions.join(', ')} file
                    </p>
                </div>
            ) : (
                <div className='flex flex-col items-center justify-center text-center flex-1 px-4 py-2'>
                    <div className='text-sm text-gray-500 mb-1'>{myFile.handle().name}</div>
                    <Button
                        onClick={() => void setMyFile(null)}
                        data-testid={`discard_${name}`}
                        className='text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
                    >
                        Discard file
                    </Button>
                </div>
            )}
            {showUndo && isEdited && (
                <div className='absolute top-1 right-2'>
                    <Button
                        className='bg-transparent'
                        onClick={() => void reset()}
                        aria-label={`Undo ${name}`}
                        data-testid={`undo_${name}`}
                    >
                        <div className='tooltip tooltip-info whitespace-pre-line' data-tip='Revert to initial data'>
                            <UndoTwoToneIcon color='action' />
                        </div>
                    </Button>
                </div>
            )}
            {onDownload && myFile && (
                <div className={`absolute top-1 ${showUndo && isEdited ? 'right-10' : 'right-2'}`}>
                    <Button
                        className='bg-transparent'
                        onClick={onDownload}
                        disabled={downloadDisabled}
                        aria-label={`Download ${name}`}
                        data-testid={`download_${name}`}
                    >
                        <div className='tooltip tooltip-info whitespace-pre-line' data-tip='Download sequence'>
                            <IcBaselineDownload
                                className={`${downloadDisabled ? 'text-gray-200' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
                            />
                        </div>
                    </Button>
                </div>
            )}
        </div>
    );
};
