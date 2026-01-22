import { produce } from 'immer';
import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';

import useClientFlag from '../../../hooks/isClient';
import { BackendClient } from '../../../services/backendClient';
import type { FilesBySubmissionId } from '../../../types/backend';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { calculatePartSizeAndCount, splitFileIntoParts, uploadPart } from '../../../utils/multipartUpload';
import { Button } from '../../common/Button';
import type { InputMode } from '../FormOrUploadWrapper';
import LucideFile from '~icons/lucide/file';
import LucideFolderUp from '~icons/lucide/folder-up';
import LucideLoader from '~icons/lucide/loader';

type SubmissionId = string;

/**
 * The state that the component is in, right after the user dropped the files.
 * We're awaiting the presigned upload URLs from the backend, to start uploading.
 */
type AwaitingUrlState = {
    type: 'awaitingUrls';
    files: Record<
        SubmissionId,
        {
            file: File;
            name: string;
        }[]
    >;
};

type SingleFileUpload = Pending | Uploaded | Error;

type UploadInProgressState = {
    type: 'uploadInProgress';
    files: Record<SubmissionId, SingleFileUpload[]>;
};

type UploadCompleted = {
    type: 'uploadCompleted';
    files: Record<SubmissionId, Uploaded[]>;
};

type FileUploadState = AwaitingUrlState | UploadInProgressState | UploadCompleted;

type UploadStatus = 'pending' | 'uploaded' | 'error';

type Pending = {
    type: 'pending';
    file: File;
    name: string;
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
    groupId: number;
    setFileMapping: Dispatch<SetStateAction<FilesBySubmissionId | undefined>>;
    onError: (message: string) => void;
};

export const FolderUploadComponent: FC<FolderUploadComponentProps> = ({
    fileCategory: fileField,
    inputMode,
    accessToken,
    clientConfig,
    groupId,
    setFileMapping,
    onError,
}) => {
    const isClient = useClientFlag();
    const [fileUploadState, setFileUploadState] = useState<FileUploadState | undefined>(undefined);
    const [isDragging, setIsDragging] = useState(false);

    const backendClient = new BackendClient(clientConfig.backendUrl);

    function updatePartProgress(submissionId: string, fileId: string, uploadedParts: number, totalParts: number) {
        setFileUploadState((state) => {
            if (state?.type === 'uploadInProgress') {
                return produce(state, (draft) => {
                    const file = draft.files[submissionId].find((f) => f.type === 'pending' && f.fileId === fileId);
                    if (file?.type === 'pending') {
                        file.uploadedParts = uploadedParts;
                        file.totalParts = totalParts;
                    }
                });
            }
            return state;
        });
    }

    function updateFileState(submissionId: string, fileId: string, newStatus: 'uploaded' | 'error', errorMsg?: string) {
        setFileUploadState((state) => {
            if (state?.type === 'uploadInProgress') {
                return produce(state, (draft) => {
                    draft.files[submissionId] = state.files[submissionId].map((file) => {
                        if (file.type === 'pending' && file.fileId === fileId) {
                            if (newStatus === 'uploaded') {
                                return { type: 'uploaded', fileId, name: file.name, size: file.size };
                            } else {
                                return { type: 'error', name: file.name, size: file.size, msg: errorMsg! };
                            }
                        }
                        return file;
                    });
                });
            }
            return state;
        });
    }

    async function uploadMultipartFile(submissionId: string, pending: Pending) {
        const parts = splitFileIntoParts(pending.file, pending.partSize);
        const etags: string[] = [];

        for (let i = 0; i < parts.length; i++) {
            const etag = await uploadPart(pending.urls[i], parts[i]);
            etags.push(etag);
            updatePartProgress(submissionId, pending.fileId, i + 1, pending.totalParts);
        }

        const result = await backendClient.completeMultipartUpload(accessToken, [{ fileId: pending.fileId, etags }]);
        result.match(
            () => updateFileState(submissionId, pending.fileId, 'uploaded'),
            (err) => {
                updateFileState(submissionId, pending.fileId, 'error', err.detail);
                onError(err.detail);
                throw new Error(`Upload of file ${pending.fileId} failed: ${err.detail}`);
            },
        );
    }

    async function startUploading(submissionIdFileMap: Record<string, Pending[]>) {
        for (const [submissionId, files] of Object.entries(submissionIdFileMap)) {
            for (const pending of files) {
                await uploadMultipartFile(submissionId, pending);
            }
        }
    }

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
            case 'awaitingUrls': {
                void (async () => {
                    const pendingFiles: Record<SubmissionId, Pending[]> = {};
                    for (const [submissionId, files] of Object.entries(fileUploadState.files)) {
                        const thisPendingFiles: Pending[] = [];
                        pendingFiles[submissionId] = thisPendingFiles;
                        for (const file of files) {
                            const { partCount, partSize } = calculatePartSizeAndCount(file.file.size);
                            const result = await backendClient.requestMultipartUpload(
                                accessToken,
                                groupId,
                                1,
                                partCount,
                            );
                            result.match(
                                (data) => {
                                    thisPendingFiles.push({
                                        type: 'pending',
                                        file: file.file,
                                        name: file.name,
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
                    }
                    setFileUploadState({ type: 'uploadInProgress', files: pendingFiles });
                    void startUploading(pendingFiles);
                })();
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
                    type: 'awaitingUrls',
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
                    type: 'awaitingUrls',
                    files,
                });
            }
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
                    <label className='inline relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500'>
                        <span
                            onClick={(e) => {
                                e.preventDefault();
                                document.getElementById(fileField)?.click();
                            }}
                        >
                            Upload folder
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
                    {inputMode === 'form'
                        ? Object.values(fileUploadState.files)[0].map((file) => (
                              <FileListItem key={file.name} file={file} />
                          ))
                        : Object.entries(fileUploadState.files).flatMap(([submissionId, files]) => [
                              <h4 key={submissionId} className='text-xs font-medium py-2'>
                                  {submissionId}
                              </h4>,
                              ...files.map((file) => <FileListItem key={`${submissionId}/${file.name}`} file={file} />),
                          ])}
                    <ul></ul>
                </div>
            </div>

            <Button
                onClick={() => setFileUploadState(undefined)}
                data-testid={`discard_${fileField}`}
                className='text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
            >
                Discard files
            </Button>
        </div>
    );
};

type FileListeItemProps = {
    file: SingleFileUpload;
};

const FileListItem: FC<FileListeItemProps> = ({ file }) => {
    const showProgress = file.type === 'pending';
    const percentage = showProgress ? Math.round((file.uploadedParts / file.totalParts) * 100) : 0;

    return (
        <div className='flex flex-row'>
            <div className='w-3.5' />
            <LucideFile className='h-4 w-4 text-gray-500 ml-1 mr-1' />
            <div className='flex-1 min-w-0 flex items-center'>
                <span className='text-xs text-gray-700 truncate max-w-[140px]'>{file.name}</span>
                <span className='text-xs text-gray-400 ml-2 whitespace-nowrap'>({formatFileSize(file.size)})</span>
                {showProgress && <span className='text-xs text-blue-500 ml-2'>{percentage}%</span>}
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
    const foo = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    const bar = sizes[i];
    return `${foo} ${bar}`;
};

// Determine status icon for file upload
const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
        case 'pending':
            return <LucideLoader className='animate-spin h-3 w-3 text-blue-500' />;
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
