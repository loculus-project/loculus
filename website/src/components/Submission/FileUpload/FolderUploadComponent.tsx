import { produce } from 'immer';
import React, { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';

import { type FileMapping } from './fileMapping';
import type {
    Awaiting,
    FileUploadState,
    Pending,
    PreviousUpload,
    SingleFileUpload,
    Uploaded,
    UploadStatus,
} from './fileUpload';
import useClientFlag from '../../../hooks/isClient';
import { BackendClient } from '../../../services/backendClient';
import { type FileCategory } from '../../../types/config';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { calculatePartSizeAndCount, splitFileIntoParts, uploadPart } from '../../../utils/multipartUpload';
import { displayConfirmationDialog } from '../../ConfirmationDialog';
import { Button } from '../../common/Button';
import type { InputMode } from '../FormOrUploadWrapper';
import LucideFile from '~icons/lucide/file';
import LucideFolderUp from '~icons/lucide/folder-up';
import LucideLoader from '~icons/lucide/loader';

type FolderUploadComponentProps = {
    fileCategory: FileCategory;
    inputMode: InputMode;
    accessToken: string;
    clientConfig: ClientConfig;
    groupId: number;
    fileUploadState: FileUploadState | undefined;
    setFileUploadState: Dispatch<SetStateAction<FileUploadState | undefined>>;
    setFileMapping: Dispatch<SetStateAction<FileMapping | undefined>>;
    onError: (message: string) => void;
};

const FileInput = ({
    id,
    label,
    onChange,
    isDirectory,
    children,
}: {
    id: string;
    label: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isDirectory?: boolean;
    children?: React.ReactNode;
}) => {
    const isClient = useClientFlag();
    const fileInput = isClient && (
        <input
            id={id}
            name={id}
            type='file'
            className='sr-only'
            aria-label={label}
            data-testid={id}
            onChange={onChange}
            /* The webkitdirectory attribute enables folder selection */
            {...(isDirectory ? { webkitdirectory: '', directory: '' } : {})}
            multiple
        />
    );

    return children ? (
        <label className='inline cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-hidden focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500'>
            <span
                onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(id)?.click();
                }}
            >
                {children}
            </span>
            {fileInput}
        </label>
    ) : (
        fileInput
    );
};

export const FolderUploadComponent: FC<FolderUploadComponentProps> = ({
    fileCategory,
    inputMode,
    accessToken,
    clientConfig,
    groupId,
    fileUploadState,
    setFileUploadState,
    setFileMapping,
    onError,
}) => {
    const [isDragging, setIsDragging] = useState(false);

    const backendClient = new BackendClient(clientConfig.backendUrl);

    function updatePartProgress(fileId: string, uploadedParts: number, totalParts: number) {
        setFileUploadState((state) => {
            if (state?.type === 'uploadInProgress') {
                return produce(state, (draft) => {
                    const file = draft.files.find((f) => f.type === 'pending' && f.fileId === fileId);
                    if (file?.type === 'pending') {
                        file.uploadedParts = uploadedParts;
                        file.totalParts = totalParts;
                    }
                });
            }
            return state;
        });
    }

    function updateFileState(fileId: string, newStatus: 'uploaded' | 'error', errorMsg?: string) {
        setFileUploadState((state) => {
            if (state?.type === 'uploadInProgress') {
                return produce(state, (draft) => {
                    draft.files = draft.files.map((file) => {
                        if (file.type === 'pending' && file.fileId === fileId) {
                            if (newStatus === 'uploaded') {
                                return { type: 'uploaded', fileId, path: file.path, size: file.size };
                            } else {
                                return {
                                    type: 'error',
                                    path: file.path,
                                    size: file.size,
                                    msg: errorMsg!,
                                };
                            }
                        }
                        return file;
                    });
                });
            }
            return state;
        });
    }

    async function uploadMultipartFile(pending: Pending) {
        const parts = splitFileIntoParts(pending.file, pending.partSize);
        const etags: string[] = [];

        for (let i = 0; i < parts.length; i++) {
            const etag = await uploadPart(pending.urls[i], parts[i]);
            etags.push(etag);
            updatePartProgress(pending.fileId, i + 1, pending.totalParts);
        }

        const result = await backendClient.completeMultipartUpload(accessToken, [{ fileId: pending.fileId, etags }]);
        result.match(
            () => updateFileState(pending.fileId, 'uploaded'),
            (err) => {
                updateFileState(pending.fileId, 'error', err.detail);
                throw new Error(err.detail);
            },
        );
    }

    async function startUploading(pendingFiles: Pending[]) {
        for (const pending of pendingFiles) {
            try {
                await uploadMultipartFile(pending);
            } catch (err) {
                onError(
                    `Upload failed for file ${pending.fileId} ${pending.path}: ${err instanceof Error ? err.message : String(err)}`,
                );
                return;
            }
        }
    }

    async function requestFileUploads(filesAwaitingUrls: Awaiting[]): Promise<Pending[]> {
        const pendingFiles: Pending[] = [];
        for (const file of filesAwaitingUrls) {
            const { partCount, partSize } = calculatePartSizeAndCount(file.file.size);
            const result = await backendClient.requestMultipartUpload(accessToken, groupId, 1, partCount);
            result.match(
                (data) => {
                    pendingFiles.push({
                        type: 'pending',
                        file: file.file,
                        path: file.path,
                        size: file.file.size,
                        fileId: data[0].fileId,
                        urls: data[0].urls,
                        uploadedParts: 0,
                        totalParts: partCount,
                        partSize,
                        etags: [],
                    });
                },
                (err) => onError(err.detail),
            );
        }
        return pendingFiles;
    }

    useEffect(() => {
        if (fileUploadState === undefined) {
            setFileMapping((currentMapping) => {
                if (currentMapping === undefined) return undefined;
                const newMapping = new Map(currentMapping);
                newMapping.delete(fileCategory.name);
                return newMapping.size === 0 ? undefined : newMapping;
            });
            return;
        }

        switch (fileUploadState.type) {
            // If awaiting URLS, request pre signed upload URLs from the backend, assign them to the files,
            // and set the state to 'uploadInProgress'.
            case 'awaitingUrls': {
                void (async () => {
                    const pendingFiles = await requestFileUploads(fileUploadState.files);
                    setFileUploadState({ type: 'uploadInProgress', files: pendingFiles });
                    void startUploading(pendingFiles);
                })();
                break;
            }
            case 'uploadInProgress': {
                if (fileUploadState.files.every(({ type }) => type === 'uploaded' || type === 'previousUpload')) {
                    setFileUploadState({
                        type: 'uploadCompleted',
                        files: fileUploadState.files as (Uploaded | PreviousUpload)[],
                    });
                }
                break;
            }
            case 'uploadCompleted': {
                setFileMapping((currentMapping) => {
                    const newMapping = new Map(currentMapping);
                    newMapping.set(
                        fileCategory.name,
                        new Map(fileUploadState.files.map((file) => [file.path, file.fileId])),
                    );
                    return newMapping;
                });
                break;
            }
        }
    }, [fileUploadState]);

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            // exclude dot files, because files like .DS_Store cause problems otherwise
            const filesArray = filterDotFiles(Array.from(e.target.files));

            // Reset the input so the same folder can be selected again
            e.target.value = '';

            const error = isFilesArrayValid(filesArray, inputMode);
            if (error) {
                onError(error);
                return;
            }

            setFileUploadState({
                type: 'awaitingUrls',
                files: filesArray.map((f) => ({
                    type: 'awaiting',
                    file: f,
                    // Assign the path without the parent folder
                    path: f.webkitRelativePath.split('/').slice(1).join('/'),
                })),
            });
        }
    };

    const handleDiscardFile = (key: string) => {
        setFileUploadState((state) => {
            if (state?.type === 'uploadCompleted') {
                const result = produce(state, (draft) => {
                    draft.files = draft.files.filter((f) => !(f.path === key));
                });

                if (result.files.length === 0) return undefined;
                else return result;
            }
            return state;
        });
    };

    const handleDiscardAllFiles = () => setFileUploadState(undefined);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);

            // Reset the input so the same file can be selected again
            e.target.value = '';

            const error = isFilesArrayValid(filesArray, inputMode);
            if (error) {
                onError(error);
                return;
            }

            const awaiting: Awaiting[] = filesArray.map((f) => ({
                type: 'awaiting',
                file: f,
                path: f.name,
            }));

            // If the state is undefined, set it to the new awaiting files
            if (fileUploadState === undefined) {
                setFileUploadState({
                    type: 'awaitingUrls',
                    files: awaiting,
                });
                return;
            }

            // If an upload is already in progress or we're awaiting URLs, we don't want to add new files to the state
            if (fileUploadState.type === 'uploadInProgress' || fileUploadState.type === 'awaitingUrls') {
                onError('Cannot add files while an upload is in progress.');
                return;
            }

            // Check for collisions with existing files
            const filePaths = new Set(awaiting.map((file) => file.path));
            const collisions = fileUploadState.files.filter((file) => filePaths.has(file.path));

            // Updates the state of file uploads and triggers the upload of the new files
            const addFiles = async () => {
                const existingFiles = fileUploadState.files.filter((file) => !filePaths.has(file.path));
                const pendingFiles = await requestFileUploads(awaiting);
                setFileUploadState({
                    type: 'uploadInProgress',
                    files: [...existingFiles, ...pendingFiles],
                });
                void startUploading(pendingFiles);
            };

            // If there are collisions, show a confirmation dialog before proceeding
            if (collisions.length > 0) {
                displayConfirmationDialog({
                    dialogText:
                        'The following file(s) already exist and will be replaced: ' +
                        collisions.map((file) => file.path).join(', '),
                    confirmButtonText: 'Replace',
                    onConfirmation: addFiles,
                });
            } else void addFiles();
        }
    };

    return (
        <div className='flex flex-col gap-2 w-full'>
            <h3 className='text-sm font-medium'>{fileCategory.displayName ?? fileCategory.name}</h3>
            {fileUploadState === undefined || fileUploadState.type === 'awaitingUrls' ? (
                <div
                    className={`flex flex-col items-center justify-center flex-1 py-6 px-4 border rounded-lg ${fileUploadState !== undefined ? 'border-hidden' : isDragging ? 'border-dashed border-yellow-400 bg-yellow-50' : 'border-dashed border-gray-900/25'}`}
                    onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(true);
                    }}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(false);
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(false);
                        toast.info(
                            'Sorry, drag and drop is not currently supported but you can select an entire folder to upload by clicking the Upload folder button.',
                        );
                    }}
                >
                    <LucideFolderUp
                        className='mx-auto mb-2 h-12 w-12 text-gray-300'
                        aria-hidden='true'
                        data-testid='folder-up-icon'
                    />
                    {fileUploadState === undefined ? (
                        <div className='flex gap-2'>
                            <FileInput
                                id={fileCategory.name}
                                label={`Upload ${fileCategory.displayName ?? fileCategory.name}`}
                                onChange={handleFolderSelect}
                                isDirectory
                            >
                                Upload folder
                            </FileInput>
                            <span className='text-gray-600'>or</span>
                            <FileInput
                                id={`add_${fileCategory.name}`}
                                label={`Add files to ${fileCategory.displayName ?? fileCategory.name}`}
                                onChange={handleFileSelect}
                            >
                                Upload files
                            </FileInput>
                        </div>
                    ) : (
                        <p>Preparing upload ...</p>
                    )}
                    <p className='text-sm pt-2 leading-5 text-gray-600'>Select a folder, or choose individual files</p>
                </div>
            ) : (
                <div className='flex flex-col text-left px-4 py-3'>
                    <div className='justify-between items-center mb-3'>
                        {fileUploadState.files.map((file) => (
                            <div key={file.path} className='flex items-center mb-2 gap-2'>
                                <div className='flex-1 min-w-0'>
                                    <FileListItem file={file} fileCategory={fileCategory.name} />
                                </div>
                                <Button
                                    onClick={() => handleDiscardFile(file.path)}
                                    alsoDisabledIf={fileUploadState.type !== 'uploadCompleted'}
                                    data-testid={`discard_${fileCategory.name}_${file.path}`}
                                    variant='outline-neutral'
                                    className='font-normal!'
                                    size='sm'
                                >
                                    Discard file
                                </Button>
                            </div>
                        ))}
                    </div>
                    <div className='grid gap-2 w-full grid-cols-2'>
                        <FileInput
                            id={`add_${fileCategory.name}`}
                            label={`Add files to ${fileCategory.displayName ?? fileCategory.name}`}
                            onChange={handleFileSelect}
                        />
                        <Button
                            onClick={() => document.getElementById(`add_${fileCategory.name}`)?.click()}
                            alsoDisabledIf={fileUploadState.type !== 'uploadCompleted'}
                            data-testid={`add_button_${fileCategory.name}`}
                            variant='outline-neutral'
                            className='font-normal!'
                            size='sm'
                        >
                            Add additional files
                        </Button>
                        <Button
                            onClick={() =>
                                displayConfirmationDialog({
                                    dialogText: 'Are you sure you want to discard all files?',
                                    confirmButtonText: 'Discard',
                                    onConfirmation: handleDiscardAllFiles,
                                })
                            }
                            data-testid={`discard_${fileCategory.name}`}
                            variant='outline-neutral'
                            className='font-normal!'
                            size='sm'
                        >
                            Discard all files
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

type FileListeItemProps = {
    file: SingleFileUpload;
    fileCategory: string;
};

const FileListItem: FC<FileListeItemProps> = ({ file, fileCategory }) => {
    const showProgress = file.type === 'pending';
    const percentage = showProgress ? Math.round((file.uploadedParts / file.totalParts) * 100) : 0;

    return (
        <div className='flex flex-row'>
            <div className='w-3.5' />
            <LucideFile className='h-4 w-4 text-gray-500 ml-1 mr-1' />
            <div className='flex-1 min-w-0 flex items-center'>
                <FilePath file={file} />
                <span className='text-xs text-gray-400 ml-2 whitespace-nowrap'>
                    ({file.type === 'previousUpload' ? 'uploaded' : formatFileSize(file.size)})
                </span>
                <span className='text-xs text-blue-500 ml-2 w-9 shrink-0 text-right whitespace-nowrap'>
                    {showProgress ? `${percentage}%` : ''}
                </span>
            </div>
            <div
                className='ml-2 w-5 flex justify-center'
                data-testid={`status_${fileCategory}_${file.path}`}
                data-upload-status={file.type}
            >
                {getStatusIcon(file.type)}
            </div>
        </div>
    );
};

const FilePath: FC<{ file: SingleFileUpload }> = ({ file }) => {
    const folderPath = file.path.split('/').slice(0, -1);
    const fileName = file.path.split('/').slice(-1)[0];
    return (
        <span title={file.path} className='text-xs flex items-center min-w-0'>
            {folderPath.length > 0 && (
                <span className='text-gray-400 truncate max-w-[140px] mr-1'>{folderPath.join(' / ') + ' / '}</span>
            )}
            <span className='text-gray-700 truncate max-w-[140px]'>{fileName}</span>
        </span>
    );
};

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    const size = sizes[i];
    return `${value} ${size}`;
};

// Determine status icon for file upload
const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
        case 'pending':
            return <LucideLoader className='animate-spin h-3 w-3 text-blue-500' />;
        case 'previousUpload':
        case 'uploaded':
            return <span className='text-green-500 text-xs'>✓</span>;
        case 'error':
            return <span className='text-red-500 text-xs'>✗</span>;
    }
};

/**
 * Returns a filtered file list, filtering out any file that starts with a period/dot
 * or is in a directory that starts with a period/dot.
 */
const filterDotFiles = (files: File[]): File[] => {
    return files.filter((file) => {
        const segments = file.webkitRelativePath.split('/');
        return segments.every((segment) => !segment.startsWith('.'));
    });
};

/**
 * Returns `undefined` if the files are fine, or an error otherwise.
 */
const isFilesArrayValid = (files: File[], inputMode: InputMode): string | undefined => {
    if (inputMode === 'form') {
        if (files.some((f) => f.webkitRelativePath.split('/').length > 2)) {
            return 'Subdirectories are not supported for individual submissions.';
        }
    }
    const fileNames = files.map((f) => f.name);
    const folderNames = files.flatMap((f) => f.webkitRelativePath.split('/').slice(1, -1));

    if (fileNames.some((n) => /\s/.test(n))) return 'File names cannot contain whitespace.';
    if (folderNames.some((p) => /\s/.test(p))) return 'Folder names cannot contain whitespace.';
};
