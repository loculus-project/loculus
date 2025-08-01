import { useCallback, useEffect, useState, type Dispatch, type FC, type SetStateAction, useRef } from 'react';
import { toast } from 'react-toastify';

import useClientFlag from '../../../hooks/isClient';
import { useUploadProgress } from '../../../hooks/useUploadProgress';
import type { FilesBySubmissionId, Group } from '../../../types/backend';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { uploadFile, formatBytes, formatTime, type UploadProgress } from '../../../utils/multipartUpload.ts';
import type { InputMode } from '../FormOrUploadWrapper';
import LucideFile from '~icons/lucide/file';
import LucideFolderUp from '~icons/lucide/folder-up';
import LucideLoader from '~icons/lucide/loader';
import LucideUploadCloud from '~icons/lucide/upload-cloud';

type SubmissionId = string;

type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'error';

type UploadFile = {
    name: string;
    size: number;
    file?: File;
    status: UploadStatus;
    fileId?: string;
    progress?: UploadProgress;
    error?: string;
    abortController?: AbortController;
};

type FileUploadState = {
    status: 'idle' | 'ready' | 'uploading' | 'completed';
    files: Record<SubmissionId, UploadFile[]>;
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
    const [fileUploadState, setFileUploadState] = useState<FileUploadState>({
        status: 'idle',
        files: {},
    });
    const [isDragging, setIsDragging] = useState(false);
    const { overallProgress, initializeProgress, updateFileProgress, markFileCompleted, resetProgress } =
        useUploadProgress();

    // Track active uploads for cancellation
    const activeUploadsRef = useRef<Map<string, AbortController>>(new Map());
    const isCancellingRef = useRef(false);

    // Notify parent component about upload state changes
    useEffect(() => {
        const isUploading = fileUploadState.status === 'uploading';
        onUploadStateChange?.(isUploading);
    }, [fileUploadState.status, onUploadStateChange]);

    /**
     * Uploads files with simplified flow
     */
    const uploadFiles = useCallback(async () => {
        if (fileUploadState.status !== 'ready') return;

        isCancellingRef.current = false;
        activeUploadsRef.current.clear();

        // Calculate totals for progress tracking
        const allFiles = Object.values(fileUploadState.files).flat();
        const totalBytes = allFiles.reduce((sum, file) => sum + file.size, 0);
        initializeProgress(allFiles.length, totalBytes);

        // Update state to uploading
        setFileUploadState((prev) => ({ ...prev, status: 'uploading' }));

        /**
         * Helper to update individual file status
         */
        const updateFileStatus = (submissionId: string, index: number, updates: Partial<UploadFile>) => {
            setFileUploadState((prev) => {
                const files = prev.files[submissionId];
                if (index >= files.length) {
                    return prev;
                }

                return {
                    ...prev,
                    files: {
                        ...prev.files,
                        [submissionId]: files.map((file, i) => (i === index ? { ...file, ...updates } : file)),
                    },
                };
            });
        };

        // Process all files
        for (const [submissionId, files] of Object.entries(fileUploadState.files)) {
            for (let index = 0; index < files.length; index++) {
                if (isCancellingRef.current) {
                    break;
                }

                const file = files[index];
                if (!file.file) {
                    continue;
                }

                const abortController = new AbortController();
                const uploadKey = `${submissionId}-${index}`;
                activeUploadsRef.current.set(uploadKey, abortController);

                // Update file status to uploading
                updateFileStatus(submissionId, index, { status: 'uploading', abortController });

                try {
                    const result = await uploadFile(
                        file.file,
                        accessToken,
                        clientConfig,
                        group,
                        (progress) => {
                            updateFileStatus(submissionId, index, {
                                progress,
                                fileId: progress.fileId,
                            });
                            updateFileProgress(progress.fileId, progress.uploadedBytes);
                        },
                        abortController.signal,
                    );

                    // Upload completed successfully
                    updateFileStatus(submissionId, index, {
                        status: 'uploaded',
                        fileId: result.fileId,
                        progress: undefined,
                    });
                    markFileCompleted(result.fileId, file.size);
                } catch (error) {
                    const isCancelled = error instanceof Error && error.message === 'Upload cancelled';
                    const errorMessage = isCancelled
                        ? 'Upload cancelled'
                        : error instanceof Error
                          ? error.message
                          : 'Upload failed';

                    updateFileStatus(submissionId, index, {
                        status: 'error',
                        error: errorMessage,
                        progress: undefined,
                    });

                    if (isCancelled) {
                        isCancellingRef.current = true;
                        break;
                    }

                    onError(errorMessage);
                } finally {
                    activeUploadsRef.current.delete(uploadKey);
                }
            }
        }

        // Update final state
        if (!isCancellingRef.current) {
            setFileUploadState((prev) => ({ ...prev, status: 'completed' }));
        }
    }, [
        fileUploadState,
        initializeProgress,
        updateFileProgress,
        markFileCompleted,
        accessToken,
        clientConfig,
        group,
        onError,
    ]);

    const cancelAllUploads = () => {
        isCancellingRef.current = true;

        // Abort all active uploads
        activeUploadsRef.current.forEach((controller) => controller.abort());
        activeUploadsRef.current.clear();

        // Reset state
        setFileUploadState({
            status: 'idle',
            files: {},
        });
        resetProgress();
    };

    useEffect(() => {
        if (fileUploadState.status === 'idle') {
            setFileMapping((currentMapping) => {
                if (inputMode === 'bulk') {
                    if (currentMapping !== undefined) {
                        const newMapping = { ...currentMapping };
                        Object.keys(newMapping).forEach((submissionId) => {
                            newMapping[submissionId] = {
                                ...newMapping[submissionId],
                                [fileField]: [],
                            };
                        });
                        return newMapping;
                    } else {
                        return undefined;
                    }
                } else {
                    return {
                        ...(currentMapping ?? {}),
                        dummySubmissionId: {
                            [fileField]: [],
                        },
                    };
                }
            });
            return;
        }

        // Start upload when ready
        if (fileUploadState.status === 'ready') {
            void uploadFiles();
        }

        // Update file mapping when upload is completed
        if (fileUploadState.status === 'completed') {
            interface UploadedFile {
                type: 'uploaded';
                fileId: string;
                name: string;
                size: number;
            }
            const uploadedFiles: Record<string, UploadedFile[]> = {};

            Object.entries(fileUploadState.files).forEach(([submissionId, files]) => {
                uploadedFiles[submissionId] = files
                    .filter(
                        (f): f is UploadFile & { fileId: string } => f.status === 'uploaded' && f.fileId !== undefined,
                    )
                    .map((f) => ({
                        type: 'uploaded' as const,
                        fileId: f.fileId,
                        name: f.name,
                        size: f.size,
                    }));
            });

            setFileMapping((currentMapping) => {
                const newMapping = { ...(currentMapping ?? {}) };
                Object.entries(uploadedFiles).forEach(([submissionId, files]) => {
                    newMapping[submissionId] = {
                        ...(currentMapping?.[submissionId] ?? {}),
                        [fileField]: files,
                    };
                });
                return newMapping;
            });
        }
    }, [fileUploadState.status, inputMode, fileField, setFileMapping]);

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            // exclude dot files, because files like .DS_Store cause problems otherwise
            const filesArray = filterDotFiles(Array.from(e.target.files));

            const error = isFilesArrayValid(filesArray, inputMode);
            if (error) {
                onError(error);
                return;
            }

            const uploadFiles: Record<SubmissionId, UploadFile[]> = {};

            if (inputMode === 'form') {
                uploadFiles.dummySubmissionId = filesArray.map((f) => ({
                    name: f.name,
                    size: f.size,
                    file: f,
                    status: 'pending' as const,
                }));
            } else {
                // Group files by submission ID
                filesArray.forEach((file) => {
                    const submissionId = file.webkitRelativePath.split('/')[1];
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (!uploadFiles[submissionId]) {
                        uploadFiles[submissionId] = [];
                    }
                    uploadFiles[submissionId].push({
                        name: file.name,
                        size: file.size,
                        file,
                        status: 'pending' as const,
                    });
                });
            }

            setFileUploadState({
                status: 'ready',
                files: uploadFiles,
            });
        }
    };

    return fileUploadState.status === 'idle' || fileUploadState.status === 'ready' ? (
        <div
            className={`flex flex-col items-center justify-center flex-1 py-2 px-4 border rounded-lg ${fileUploadState.status !== 'idle' ? 'border-hidden' : isDragging ? 'border-dashed border-yellow-400 bg-yellow-50' : 'border-dashed border-gray-900/25'}`}
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
                {fileUploadState.status === 'idle' ? (
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
                            ? Object.values(fileUploadState.files)[0]?.map((file, index) => (
                                  <FileListItem key={file.fileId ?? `${file.name}-${index}`} file={file} />
                              ))
                            : Object.entries(fileUploadState.files).flatMap(([submissionId, files]) => [
                                  <h4 key={submissionId} className='text-xs font-medium py-2'>
                                      {submissionId}
                                  </h4>,
                                  ...files.map((file, index) => (
                                      <FileListItem key={file.fileId ?? `${file.name}-${index}`} file={file} />
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
                {fileUploadState.status === 'uploading' ? 'Cancel all uploads' : 'Discard files'}
            </button>
        </div>
    );
};

type FileListItemProps = {
    file: UploadFile;
};

const FileListItem: FC<FileListItemProps> = ({ file }) => {
    const isUploading = file.status === 'uploading';
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
                <div className='ml-2 w-5 flex justify-center'>{getStatusIcon(file.status)}</div>
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
