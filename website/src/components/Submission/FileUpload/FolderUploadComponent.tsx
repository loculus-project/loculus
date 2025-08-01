import { produce } from 'immer';
import { useEffect, useState, type Dispatch, type FC, type SetStateAction, useRef } from 'react';
import { toast } from 'react-toastify';

import useClientFlag from '../../../hooks/isClient';
import type { FilesBySubmissionId, Group } from '../../../types/backend';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { uploadFile, formatBytes, formatTime, type UploadProgress } from '../../../utils/multipartUpload.ts';
import type { InputMode } from '../FormOrUploadWrapper';
import LucideFile from '~icons/lucide/file';
import LucideFolderUp from '~icons/lucide/folder-up';
import LucideLoader from '~icons/lucide/loader';
import LucideUploadCloud from '~icons/lucide/upload-cloud';

type SubmissionId = string;

/**
 * The state that the component is in, right after the user dropped the files.
 * We're awaiting the presigned upload URLs from the backend, to start uploading.
 */
type ReadyToUploadState = {
    type: 'readyToUpload';
    files: Record<SubmissionId, FileInfo[]>;
};

type UploadInProgressState = {
    type: 'uploadInProgress';
    files: Record<SubmissionId, (Pending | Uploading | Uploaded | Error)[]>;
};

type UploadCompleted = {
    type: 'uploadCompleted';
    files: Record<SubmissionId, Uploaded[]>;
};

type FileUploadState = ReadyToUploadState | UploadInProgressState | UploadCompleted;

type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'error';

interface FileInfo {
    file: File;
    name: string;
}

type Pending = {
    type: 'pending';
    file: File;
    name: string;
    size: number;
};

type Uploading = {
    type: 'uploading';
    fileId: string;
    name: string;
    size: number;
    progress: UploadProgress;
    abortController: AbortController;
};

type Uploaded = {
    type: 'uploaded';
    fileId: string;
    name: string;
    size: number;
};

type Error = {
    type: 'error';
    name: string;
    size: number;
    msg: string;
};

type FolderUploadComponentProps = {
    fileCategory: string;
    inputMode: InputMode;
    accessToken: string;
    clientConfig: ClientConfig;
    group: Group;
    setFileMapping: Dispatch<SetStateAction<FilesBySubmissionId | undefined>>;
    onError: (message: string) => void;
    onUploadStateChange?: (isUploading: boolean) => void;
};

export const FolderUploadComponent: FC<FolderUploadComponentProps> = ({
    fileCategory: fileField,
    inputMode,
    accessToken,
    clientConfig,
    group,
    setFileMapping,
    onError,
    onUploadStateChange,
}) => {
    const isClient = useClientFlag();
    const [fileUploadState, setFileUploadState] = useState<FileUploadState | undefined>(undefined);
    const [isDragging, setIsDragging] = useState(false);
    const [overallProgress, setOverallProgress] = useState<{
        totalFiles: number;
        uploadedFiles: number;
        totalBytes: number;
        uploadedBytes: number;
    } | null>(null);

    // Track individual file progress separately for accurate overall progress
    const fileProgressRef = useRef<Record<string, number>>({});
    // Track if we're cancelling to avoid completing uploads
    const isCancellingRef = useRef(false);

    // Notify parent component about upload state changes
    useEffect(() => {
        const isUploading =
            fileUploadState?.type === 'uploadInProgress' &&
            Object.values(fileUploadState.files)
                .flat()
                .some((f) => f.type === 'uploading');
        onUploadStateChange?.(isUploading);
    }, [fileUploadState, onUploadStateChange]);

    /**
     * Takes a map of submission IDs to files that are ready for upload, and triggers uploads for each file.
     */
    async function startUploading(submissionIdFileMap: Record<SubmissionId, FileInfo[]>) {
        const allFiles = Object.values(submissionIdFileMap).flat();
        const totalBytes = allFiles.reduce((sum, file) => sum + file.file.size, 0);

        // Reset progress tracking and cancelling flag
        fileProgressRef.current = {};
        isCancellingRef.current = false;

        setOverallProgress({
            totalFiles: allFiles.length,
            uploadedFiles: 0,
            totalBytes,
            uploadedBytes: 0,
        });

        // First, convert to uploading state with pending files
        const pendingFiles: Record<SubmissionId, (Pending | Uploading | Uploaded | Error)[]> = {};
        Object.entries(submissionIdFileMap).forEach(([submissionId, files]) => {
            pendingFiles[submissionId] = files.map((fileInfo) => ({
                type: 'pending' as const,
                file: fileInfo.file,
                name: fileInfo.name,
                size: fileInfo.file.size,
            }));
        });

        setFileUploadState({
            type: 'uploadInProgress',
            files: pendingFiles,
        });

        for (const [submissionId, files] of Object.entries(submissionIdFileMap)) {
            for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
                const fileInfo = files[fileIndex];
                const abortController = new AbortController();
                let fileId: string = '';

                // Update to uploading state
                setFileUploadState((state) => {
                    if (state?.type === 'uploadInProgress') {
                        return produce(state, (draft) => {
                            if (fileIndex < draft.files[submissionId].length) {
                                draft.files[submissionId][fileIndex] = {
                                    type: 'uploading',
                                    fileId: '', // Will be set once upload starts
                                    name: fileInfo.name,
                                    size: fileInfo.file.size,
                                    progress: {
                                        fileId: '',
                                        fileName: fileInfo.name,
                                        totalBytes: fileInfo.file.size,
                                        uploadedBytes: 0,
                                        percentage: 0,
                                        speed: 0,
                                        remainingTime: 0,
                                        status: 'uploading',
                                    },
                                    abortController,
                                };
                            }
                        });
                    }
                    return state;
                });

                try {
                    const result = await uploadFile(
                        fileInfo.file,
                        accessToken,
                        clientConfig,
                        group,
                        (progress) => {
                            // Store the fileId once we get it
                            if (!fileId && progress.fileId) {
                                fileId = progress.fileId;
                            }

                            setFileUploadState((state) => {
                                if (state?.type === 'uploadInProgress') {
                                    return produce(state, (draft) => {
                                        if (
                                            fileIndex < draft.files[submissionId].length &&
                                            draft.files[submissionId][fileIndex].type === 'uploading'
                                        ) {
                                            const uploadingFile = draft.files[submissionId][fileIndex] as Uploading;
                                            uploadingFile.progress = progress;
                                            uploadingFile.fileId = progress.fileId;
                                        }
                                    });
                                }
                                return state;
                            });

                            // Update overall progress
                            fileProgressRef.current[progress.fileId] = progress.uploadedBytes;

                            setOverallProgress((prev) => {
                                if (!prev) return null;

                                // Calculate total uploaded bytes from all tracked files
                                const totalUploadedBytes = Object.values(fileProgressRef.current).reduce(
                                    (sum, bytes) => sum + bytes,
                                    0,
                                );

                                return {
                                    ...prev,
                                    uploadedBytes: totalUploadedBytes,
                                };
                            });
                        },
                        abortController.signal,
                    );

                    fileId = result.fileId;

                    // Mark file as fully uploaded in progress tracking
                    fileProgressRef.current[fileId] = fileInfo.file.size;

                    // Update to uploaded state
                    setFileUploadState((state) => {
                        if (state?.type === 'uploadInProgress') {
                            return produce(state, (draft) => {
                                if (fileIndex < draft.files[submissionId].length) {
                                    draft.files[submissionId][fileIndex] = {
                                        type: 'uploaded',
                                        fileId,
                                        name: fileInfo.name,
                                        size: fileInfo.file.size,
                                    };
                                }
                            });
                        }
                        return state;
                    });

                    setOverallProgress((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  uploadedFiles: prev.uploadedFiles + 1,
                                  uploadedBytes: Object.values(fileProgressRef.current).reduce(
                                      (sum, bytes) => sum + bytes,
                                      0,
                                  ),
                              }
                            : null,
                    );
                } catch (error) {
                    // Check if this is a cancellation
                    const isCancelled = error instanceof Error && error.message === 'Upload cancelled';
                    let errorMessage = 'Upload failed';

                    if (isCancelled) {
                        errorMessage = 'Upload cancelled';
                    } else if (error instanceof Error) {
                        errorMessage = error.message;
                    }

                    setFileUploadState((state) => {
                        if (state?.type === 'uploadInProgress') {
                            return produce(state, (draft) => {
                                if (fileIndex < draft.files[submissionId].length) {
                                    draft.files[submissionId][fileIndex] = {
                                        type: 'error',
                                        name: fileInfo.name,
                                        size: fileInfo.file.size,
                                        msg: errorMessage,
                                    };
                                }
                            });
                        }
                        return state;
                    });

                    // If cancelled, stop processing more files
                    if (isCancelled) {
                        isCancellingRef.current = true;
                        return;
                    }

                    // Surface non-cancellation errors to user
                    onError(errorMessage);
                }
            }
        }
    }

    const cancelAllUploads = () => {
        if (fileUploadState?.type === 'uploadInProgress') {
            // Abort all active uploads
            Object.values(fileUploadState.files)
                .flat()
                .forEach((file) => {
                    if (file.type === 'uploading') {
                        file.abortController.abort();
                    }
                });
        }
        setFileUploadState(undefined);
        setOverallProgress(null);
        fileProgressRef.current = {};
    };

    useEffect(() => {
        if (fileUploadState === undefined) {
            setFileMapping((currentMapping) => {
                if (inputMode === 'bulk') {
                    if (currentMapping !== undefined) {
                        return produce(currentMapping, (draft) => {
                            Object.keys(draft).forEach((submissionId) => {
                                draft[submissionId][fileField] = [];
                            });
                        });
                    } else {
                        return undefined;
                    }
                } else {
                    return produce(currentMapping ?? {}, (draft) => {
                        draft.dummySubmissionId = {
                            [fileField]: [],
                        };
                    });
                }
            });
            return;
        }

        switch (fileUploadState.type) {
            // If awaiting URLS, request pre signed upload URLs from the backend, assign them to the files,
            // and set the state to 'uploadInProgress'.
            case 'readyToUpload': {
                void startUploading(fileUploadState.files);
                break;
            }
            case 'uploadInProgress': {
                if (
                    Object.values(fileUploadState.files)
                        .flatMap((x) => x)
                        .every(({ type }) => type === 'uploaded')
                ) {
                    setFileUploadState({
                        type: 'uploadCompleted',
                        files: fileUploadState.files as Record<string, Uploaded[]>,
                    });
                }
                break;
            }
            case 'uploadCompleted': {
                setFileMapping((currentMapping) =>
                    produce(currentMapping ?? {}, (draft) => {
                        Object.entries(fileUploadState.files).forEach(([submissionId, files]) => {
                            if (currentMapping?.[submissionId] !== undefined) {
                                draft[submissionId] = { ...currentMapping[submissionId] };
                            } else {
                                draft[submissionId] = {};
                            }
                            draft[submissionId][fileField] = files;
                        });
                    }),
                );
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

            if (inputMode === 'form') {
                setFileUploadState({
                    type: 'readyToUpload',
                    files: { dummySubmissionId: filesArray.map((f) => ({ file: f, name: f.name })) },
                });
            } else {
                const files: Record<
                    string,
                    {
                        file: File;
                        name: string;
                    }[]
                > = Object.fromEntries(
                    filesArray
                        .map((file) => file.webkitRelativePath.split('/'))
                        .map((pathSegments) => [pathSegments[1], []]),
                );

                filesArray.forEach((file) => {
                    const submissionId = file.webkitRelativePath.split('/')[1];
                    files[submissionId].push({ file, name: file.name });
                });

                setFileUploadState({
                    type: 'readyToUpload',
                    files,
                });
            }
        }
    };

    return fileUploadState === undefined || fileUploadState.type === 'readyToUpload' ? (
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
                    'Sorry, drag and drop is not currently supported but you can select an entire folder to upload by clicking the Upload Folder button.',
                );
            }}
        >
            <LucideFolderUp className={`mx-auto mt-4 mb-2 h-12 w-12 text-gray-300`} aria-hidden='true' />
            <div>
                {fileUploadState === undefined ? (
                    <label className='inline relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500'>
                        <span
                            onClick={(e) => {
                                e.preventDefault();
                                document.getElementById(fileField)?.click();
                            }}
                        >
                            Upload Folder
                        </span>
                        {isClient && (
                            <input
                                id={fileField}
                                name={fileField}
                                type='file'
                                className='sr-only'
                                aria-label={`Upload ${fileField}`}
                                data-testid={fileField}
                                onChange={handleFolderSelect}
                                /* The webkitdirectory attribute enables folder selection */
                                {...{ webkitdirectory: '', directory: '' }}
                                multiple
                            />
                        )}
                    </label>
                ) : (
                    <p>Processing files...</p>
                )}
            </div>
            <p className='text-sm pt-2 leading-5 text-gray-600'>Upload an entire folder of files</p>
        </div>
    ) : (
        <div className='flex flex-col text-left px-4 py-3'>
            {overallProgress && (
                <div className='mb-4 p-3 bg-gray-50 rounded-lg'>
                    <div className='flex justify-between items-center mb-2'>
                        <span className='text-sm font-medium text-gray-700'>
                            Overall Progress: {overallProgress.uploadedFiles} / {overallProgress.totalFiles} files
                        </span>
                        <span className='text-sm text-gray-600'>
                            {formatBytes(overallProgress.uploadedBytes)} / {formatBytes(overallProgress.totalBytes)}
                        </span>
                    </div>
                    <div className='w-full bg-gray-200 rounded-full h-2'>
                        <div
                            className='bg-primary-600 h-2 rounded-full transition-all duration-300'
                            style={{
                                width: `${Math.round((overallProgress.uploadedBytes / overallProgress.totalBytes) * 100)}%`,
                            }}
                        />
                    </div>
                </div>
            )}

            <div className='flex justify-between items-center mb-3'>
                <div className='w-full'>
                    <h3 className='text-sm font-medium mb-2'>Files</h3>
                    <div className='max-h-60 overflow-y-auto'>
                        {inputMode === 'form'
                            ? Object.values(fileUploadState.files)[0].map((file, index) => (
                                  <FileListItem
                                      key={'fileId' in file ? file.fileId : `${file.name}-${index}`}
                                      file={file}
                                  />
                              ))
                            : Object.entries(fileUploadState.files).flatMap(([submissionId, files]) => [
                                  <h4 key={submissionId} className='text-xs font-medium py-2'>
                                      {submissionId}
                                  </h4>,
                                  ...files.map((file, index) => (
                                      <FileListItem
                                          key={'fileId' in file ? file.fileId : `${file.name}-${index}`}
                                          file={file}
                                      />
                                  )),
                              ])}
                    </div>
                </div>
            </div>

            <button
                onClick={cancelAllUploads}
                data-testid={`discard_${fileField}`}
                className='text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
            >
                {fileUploadState.type === 'uploadInProgress' &&
                Object.values(fileUploadState.files)
                    .flat()
                    .some((f) => f.type === 'uploading')
                    ? 'Cancel all uploads'
                    : 'Discard files'}
            </button>
        </div>
    );
};

type FileListItemProps = {
    file: Pending | Uploading | Uploaded | Error;
};

const FileListItem: FC<FileListItemProps> = ({ file }) => {
    const isUploading = file.type === 'uploading';
    const progress = isUploading ? file.progress : null;

    return (
        <div className='flex flex-col mb-2'>
            <div className='flex flex-row items-center'>
                <div className='w-3.5' />
                <LucideFile className='h-4 w-4 text-gray-500 ml-1 mr-1' />
                <div className='flex-1 min-w-0 flex items-center'>
                    <span className='text-xs text-gray-700 truncate max-w-[140px]'>{file.name}</span>
                    <span className='text-xs text-gray-400 ml-2 whitespace-nowrap'>({formatFileSize(file.size)})</span>
                </div>
                {/* Status icon */}
                <div className='ml-2 w-5 flex justify-center'>{getStatusIcon(file.type)}</div>
            </div>

            {isUploading && progress && (
                <div className='ml-9 mr-7 mt-1'>
                    <div className='flex items-center gap-2'>
                        <div className='flex-1'>
                            <div className='w-full bg-gray-200 rounded-full h-1.5'>
                                <div
                                    className='bg-primary-600 h-1.5 rounded-full transition-all duration-300'
                                    style={{ width: `${progress.percentage}%` }}
                                />
                            </div>
                        </div>
                        <span className='text-xs text-gray-600 min-w-[3rem] text-right'>{progress.percentage}%</span>
                    </div>
                    {progress.speed > 0 && (
                        <div className='flex justify-between text-xs text-gray-500 mt-0.5'>
                            <span>{formatBytes(progress.speed)}/s</span>
                            <span>ETA: {formatTime(progress.remainingTime)}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const foo = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    const bar = sizes[i];
    return `${foo} ${bar}`;
};

// Determine status icon for file upload
const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
        case 'pending':
            return <LucideLoader className='animate-spin h-3 w-3 text-blue-500' />;
        case 'uploading':
            return <LucideUploadCloud className='animate-pulse h-3 w-3 text-primary-600' />;
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
    const subdirectories = files
        .map((file) => file.webkitRelativePath.split('/'))
        .filter((pathSegments) => pathSegments.length > (inputMode === 'form' ? 2 : 3))
        .map((pathSegments) => pathSegments[pathSegments.length - 2]);
    if (subdirectories.length > 0) {
        return 'Subdirectories are not yet supported.';
    }
    const toplevelFiles = files
        .map((file) => file.webkitRelativePath.split('/'))
        .filter((pathSegments) => pathSegments.length < (inputMode === 'form' ? 2 : 3))
        .map((pathSegments) => pathSegments[pathSegments.length - 1]);
    if (toplevelFiles.length > 0) {
        return `All files need to be inside a directory named with a sequence ID; these files are not: ${toplevelFiles.join(', ')}`;
    }
};
