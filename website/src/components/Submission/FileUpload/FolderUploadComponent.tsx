import { produce } from 'immer';
import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';

import useClientFlag from '../../../hooks/isClient';
import { BackendClient } from '../../../services/backendClient';
import type { FilesBySubmissionId } from '../../../types/backend';
import { type FileCategory } from '../../../types/config';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { calculatePartSizeAndCount, splitFileIntoParts, uploadPart } from '../../../utils/multipartUpload';
import { displayConfirmationDialog } from '../../ConfirmationDialog';
import { Button } from '../../common/Button';
import type { InputMode } from '../FormOrUploadWrapper';
import LucideFile from '~icons/lucide/file';
import LucideFolderUp from '~icons/lucide/folder-up';
import LucideLoader from '~icons/lucide/loader';

const DUMMY_SUBMISSION_ID = 'dummySubmissionId';

/**
 * The state that the component is in, right after the user dropped the files.
 * We're awaiting the presigned upload URLs from the backend, to start uploading.
 */
type AwaitingUrlState = {
    type: 'awaitingUrls';
    files: Awaiting[];
};

type UploadInProgressState = {
    type: 'uploadInProgress';
    files: SingleFileUpload[];
};

type UploadCompleted = {
    type: 'uploadCompleted';
    files: (Uploaded | PreviousUpload)[];
};

type FileUploadState = AwaitingUrlState | UploadInProgressState | UploadCompleted;

type UploadStatus = 'pending' | 'uploaded' | 'previousUpload' | 'error';

type Awaiting = {
    type: 'awaiting';
    file: File;
    name: string;
    path: string;
};

type Pending = {
    type: 'pending';
    file: File;
    name: string;
    path: string;
    size: number;
    fileId: string;
    urls: string[];
    uploadedParts: number;
    totalParts: number;
    partSize: number;
    etags?: string[];
};

type Uploaded = {
    type: 'uploaded';
    fileId: string;
    name: string;
    path: string;
    size: number;
};

type PreviousUpload = {
    type: 'previousUpload';
    fileId: string;
    name: string;
};

type Error = {
    type: 'error';
    name: string;
    path: string;
    size: number;
    msg: string;
};

type SingleFileUpload = Pending | Uploaded | PreviousUpload | Error;

type FolderUploadComponentProps = {
    fileCategory: FileCategory;
    inputMode: InputMode;
    accessToken: string;
    clientConfig: ClientConfig;
    groupId: number;
    fileMapping: FilesBySubmissionId | undefined;
    setFileMapping: Dispatch<SetStateAction<FilesBySubmissionId | undefined>>;
    // Passed when the submissionId is known (e.g. editing/revising an entry) in form mode,
    // where it is used instead of the dummySubmissionId placeholder.
    formSubmissionId?: string;
    onError: (message: string) => void;
};

export const FolderUploadComponent: FC<FolderUploadComponentProps> = ({
    fileCategory,
    inputMode,
    accessToken,
    clientConfig,
    groupId,
    fileMapping,
    setFileMapping,
    formSubmissionId,
    onError,
}) => {
    const isClient = useClientFlag();
    const [fileUploadState, setFileUploadState] = useState<FileUploadState | undefined>(() => {
        if (fileMapping === undefined) return undefined;

        // TODO: Re-implement previous uploads
        // const previousUploadFiles: Record<SubmissionId, PreviousUpload[]> = {};
        // Object.entries(fileMapping).forEach(([submissionId, categories]) => {
        //     const fileCategoryFiles = categories[fileCategory.name] ?? [];
        //     previousUploadFiles[submissionId] = fileCategoryFiles.map((file) => ({
        //         type: 'previousUpload',
        //         fileId: file.fileId,
        //         name: file.name,
        //     }));
        // });

        // const hasPreviousFiles = Object.values(previousUploadFiles).some((files) => files.length > 0);
        // if (!hasPreviousFiles) return undefined;

        return { type: 'uploadCompleted', files: [] };
    });
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
                                return { type: 'uploaded', fileId, name: file.name, path: file.path, size: file.size };
                            } else {
                                return {
                                    type: 'error',
                                    name: file.name,
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
                onError(err.detail);
                throw new Error(`Upload of file ${pending.fileId} failed: ${err.detail}`);
            },
        );
    }

    async function startUploading(pendingFiles: Pending[]) {
        for (const pending of pendingFiles) {
            await uploadMultipartFile(pending);
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
                        name: file.name,
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
                if (inputMode === 'bulk') {
                    if (currentMapping !== undefined) {
                        return produce(currentMapping, (draft) => {
                            Object.keys(draft).forEach((submissionId) => {
                                draft[submissionId][fileCategory.name] = [];
                            });
                        });
                    } else {
                        return undefined;
                    }
                } else {
                    return produce(currentMapping ?? {}, (draft) => {
                        const submissionId = formSubmissionId ?? DUMMY_SUBMISSION_ID;
                        draft[submissionId] = { ...draft[submissionId], [fileCategory.name]: [] };
                    });
                }
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
                // TODO: Re-implement file mapping updates
                // setFileMapping((currentMapping) =>
                //     produce(currentMapping ?? {}, (draft) => {
                //         Object.entries(fileUploadState.files).forEach(([submissionId, files]) => {
                //             if (currentMapping?.[submissionId] !== undefined) {
                //                 draft[submissionId] = { ...currentMapping[submissionId] };
                //             } else {
                //                 draft[submissionId] = {};
                //             }
                //             draft[submissionId][fileCategory.name] = files;
                //         });
                //     }),
                // );
                break;
            }
        }
    }, [fileUploadState]);

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            // exclude dot files, because files like .DS_Store cause problems otherwise
            const filesArray = filterDotFiles(Array.from(e.target.files));

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
                    name: f.name,
                    path: getRelativePath(f.webkitRelativePath),
                })),
            });
        }
    };

    const handleDiscardFile = (key: string) => {
        setFileUploadState((state) => {
            if (state?.type === 'uploadCompleted') {
                const result = produce(state, (draft) => {
                    draft.files = draft.files.filter((f) => !hasFileKey(f, key));
                });

                if (result.files.length === 0) return undefined;
                else return result;
            }
            return state;
        });
    };

    const handleDiscardAllFiles = () => setFileUploadState(undefined);

    const handleAddAdditionalFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            if (fileUploadState?.type !== 'uploadCompleted') return;

            // exclude dot files, because files like .DS_Store cause problems otherwise
            const filesArray = filterDotFiles(Array.from(e.target.files));

            // Reset the input so selecting the same file again re-triggers onChange.
            e.target.value = '';
            if (filesArray.length === 0) return;

            const awaiting: Awaiting[] = filesArray.map((f) => ({
                type: 'awaiting',
                file: f,
                name: f.name,
                path: f.name,
            }));

            // Check for collisions with existing files
            const filePaths = new Set(awaiting.map((file) => file.path));
            const collisions = fileUploadState.files.filter((file) => 'path' in file && filePaths.has(file.path));

            // Updates the state of file uploads and triggers the upload of the new files
            const addAdditionalFiles = async () => {
                const existingFiles = fileUploadState.files.filter(
                    (file) => !('path' in file) || !filePaths.has(file.path),
                );
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
                        collisions.map((file) => file.name).join(', '),
                    confirmButtonText: 'Replace',
                    onConfirmation: addAdditionalFiles,
                });
            } else void addAdditionalFiles();
        }
    };

    return fileUploadState === undefined || fileUploadState.type === 'awaitingUrls' ? (
        <div
            className={`flex flex-col items-center justify-center flex-1 py-2 px-4 border rounded-lg ${fileUploadState !== undefined ? 'border-hidden' : isDragging ? 'border-dashed border-yellow-400 bg-yellow-50' : 'border-dashed border-gray-900/25'}`}
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
                className={`mx-auto mt-4 mb-2 h-12 w-12 text-gray-300`}
                aria-hidden='true'
                data-testid='folder-up-icon'
            />
            <div>
                {fileUploadState === undefined ? (
                    <label className='inline relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-hidden focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500'>
                        <span
                            onClick={(e) => {
                                e.preventDefault();
                                document.getElementById(fileCategory.name)?.click();
                            }}
                        >
                            Upload folder: {fileCategory.displayName ?? fileCategory.name}
                        </span>
                        {isClient && (
                            <input
                                id={fileCategory.name}
                                name={fileCategory.name}
                                type='file'
                                className='sr-only'
                                aria-label={`Upload ${fileCategory.displayName ?? fileCategory.name}`}
                                data-testid={fileCategory.name}
                                onChange={handleFolderSelect}
                                /* The webkitdirectory attribute enables folder selection */
                                {...{ webkitdirectory: '', directory: '' }}
                                multiple
                            />
                        )}
                    </label>
                ) : (
                    <p>Preparing upload ...</p>
                )}
            </div>
            <p className='text-sm pt-2 leading-5 text-gray-600'>Upload an entire folder of files</p>
        </div>
    ) : (
        <div className='flex flex-col text-left px-4 py-3'>
            <div className='flex justify-between items-center mb-3'>
                <div>
                    <h3 className='text-sm font-medium'>Files</h3>
                    {fileUploadState.files.map((file) => (
                        <div key={getFileKey(file)} className='flex items-center mb-2 gap-2'>
                            <div className='flex-1 min-w-0'>
                                <FileListItem file={file} />
                            </div>
                            <Button
                                onClick={() => handleDiscardFile(getFileKey(file))}
                                disabled={fileUploadState.type !== 'uploadCompleted'}
                                data-testid={`discard_${fileCategory.name}_${getFileKey(file)}`}
                                variant='outline-neutral'
                                className='font-normal!'
                                size='sm'
                            >
                                Discard file
                            </Button>
                        </div>
                    ))}
                </div>
            </div>
            <div className='grid gap-2 w-full grid-cols-2'>
                {isClient && (
                    <input
                        id={`${fileCategory.name}_add`}
                        type='file'
                        className='sr-only'
                        aria-label={`Add files to ${fileCategory.displayName ?? fileCategory.name}`}
                        data-testid={`add_${fileCategory.name}`}
                        onChange={handleAddAdditionalFiles}
                        multiple
                    />
                )}
                <Button
                    onClick={() => document.getElementById(`${fileCategory.name}_add`)?.click()}
                    disabled={fileUploadState.type !== 'uploadCompleted'}
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
    );
};

type FileListeItemProps = {
    file: SingleFileUpload;
};

const FileListItem: FC<FileListeItemProps> = ({ file }) => {
    const showProgress = file.type === 'pending';
    const percentage = showProgress ? Math.round((file.uploadedParts / file.totalParts) * 100) : 0;
    const folderPath = file.type !== 'previousUpload' ? file.path.split('/').slice(0, -1) : [];

    return (
        <div className='flex flex-row'>
            <div className='w-3.5' />
            <LucideFile className='h-4 w-4 text-gray-500 ml-1 mr-1' />
            <div className='flex-1 min-w-0 flex items-center'>
                {file.type !== 'previousUpload' && folderPath.length > 0 && (
                    <>
                        <span className='text-xs text-gray-400 truncate max-w-[140px]'>{folderPath.join('/')}</span>
                        <span className='text-xs text-gray-400'>/</span>
                    </>
                )}
                <span className='text-xs text-gray-700 truncate max-w-[140px]'>{file.name}</span>
                {file.type === 'previousUpload' ? (
                    <span className='text-xs text-gray-400 ml-2 whitespace-nowrap'>(uploaded)</span>
                ) : (
                    <span className='text-xs text-gray-400 ml-2 whitespace-nowrap'>({formatFileSize(file.size)})</span>
                )}
                <span className='text-xs text-blue-500 ml-2 w-9 shrink-0 text-right whitespace-nowrap'>
                    {showProgress ? `${percentage}%` : ''}
                </span>
            </div>
            {/* Status icon */}
            <div className='ml-2 w-5 flex justify-center'>{getStatusIcon(file.type)}</div>
        </div>
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
};

/* Takes a webkitRelativePath and returns the path without the parent folder. */
const getRelativePath = (path: string) => {
    return path.split('/').slice(1).join('/');
};

const getFileKey = (file: SingleFileUpload) => {
    return 'path' in file ? file.path : file.fileId;
};

const hasFileKey = (file: SingleFileUpload, key: string) => {
    return getFileKey(file) === key;
};
