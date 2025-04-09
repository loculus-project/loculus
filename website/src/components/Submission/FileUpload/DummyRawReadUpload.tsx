import { produce } from 'immer';
import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import useClientFlag from '../../../hooks/isClient';
import { backendClientHooks } from '../../../services/serviceHooks';
import type { FileMapping, Group } from '../../../types/backend';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../../utils/createAuthorizationHeader';
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

type UploadInProgressState = {
    type: 'uploadInProgress';
    files: Record<SubmissionId, (Pending | Uploaded | Error)[]>;
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
    url: string;
    fileId: string;
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

type DummyRawReadUploadProps = {
    fileField: string;
    inputMode: InputMode;
    accessToken: string;
    clientConfig: ClientConfig;
    group: Group;
    setFileMapping: Dispatch<SetStateAction<FileMapping | undefined>>;
    onError: (message: string) => void;
};

export const DummyRawReadUpload: FC<DummyRawReadUploadProps> = ({
    fileField,
    inputMode,
    accessToken,
    clientConfig,
    group,
    setFileMapping,
    onError,
}) => {
    const isClient = useClientFlag();
    const [fileUploadState, setFileUploadState] = useState<FileUploadState | undefined>(undefined);

    const { mutateAsync } = backendClientHooks(clientConfig).useRequestUpload({
        headers: createAuthorizationHeader(accessToken),
        queries: {
            groupId: group.groupId,
            numberFiles: 10,
        },
    });

    useEffect(() => {
        if (fileUploadState === undefined) {
            setFileMapping((currentMapping) =>
                produce(currentMapping ?? {}, (draft) => {
                    draft.dummySubmissionId = {
                        [fileField]: [],
                    };
                }),
            );
            return;
        }

        switch (fileUploadState.type) {
            case 'awaitingUrls': {
                const _awaitingUrlCount = Object.keys(fileUploadState.files)
                    .map((l) => l.length)
                    .reduce((a, b) => a + b);

                // TODO -> why can't I set the variables here?!
                mutateAsync(undefined)
                    .then((val) => {
                        const result: Record<string, Pending[]> = {};
                        Object.keys(fileUploadState.files).forEach((submissionId) => (result[submissionId] = []));
                        let i = 0;
                        Object.entries(fileUploadState.files).forEach(([submissionId, files]) => {
                            files.forEach((file) => {
                                result[submissionId].push({
                                    type: 'pending',
                                    file: file.file,
                                    name: file.name,
                                    size: file.file.size,
                                    url: val[i].url,
                                    fileId: val[i].fileId,
                                });
                                i++;
                            });
                        });
                        setFileUploadState({
                            type: 'uploadInProgress',
                            files: result,
                        });

                        Object.entries(result).forEach(([submissionId, files]) => {
                            files.forEach(({ file, url, fileId }) => {
                                fetch(url, {
                                    method: 'PUT',
                                    headers: {
                                        // eslint-disable-next-line @typescript-eslint/naming-convention
                                        'Content-Type': file.type,
                                    },
                                    body: file,
                                })
                                    .then((response) => {
                                        setFileUploadState((state) => {
                                            if (state?.type === 'uploadInProgress') {
                                                return produce(state, (draft) => {
                                                    draft.files[submissionId] = state.files[submissionId].map(
                                                        (file) => {
                                                            if (file.type === 'pending' && file.fileId === fileId) {
                                                                if (response.ok) {
                                                                    return {
                                                                        type: 'uploaded',
                                                                        fileId: file.fileId,
                                                                        name: file.name,
                                                                        size: file.size,
                                                                    };
                                                                } else {
                                                                    return {
                                                                        type: 'error',
                                                                        msg: 'error',
                                                                        name: file.name,
                                                                        size: file.size,
                                                                    };
                                                                }
                                                            } else {
                                                                return file;
                                                            }
                                                        },
                                                    );
                                                });
                                            }
                                            return state;
                                        });
                                    })
                                    .catch((error: unknown) => {
                                        if (error instanceof Error) {
                                            onError(error.message);
                                        }
                                    });
                            });
                        });
                    })
                    .catch(() => onError('failed to prepare upload.'));
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
            const filesArray = Array.from(e.target.files);

            const subdirectories = filesArray
                .map((file) => file.webkitRelativePath.split('/'))
                .filter((pathSegments) => pathSegments.length > (inputMode === 'form' ? 2 : 3))
                .map((pathSegments) => pathSegments[1]);
            if (subdirectories.length > 0) {
                onError('Subdirectories are not yet supported.');
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
        <div className='flex flex-col items-center justify-center flex-1 py-2 px-4'>
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
                    <p>Preparing upload ...</p>
                )}
            </div>
            <p className='text-sm pt-2 leading-5 text-gray-600'>Upload an entire folder of raw read files</p>
        </div>
    ) : (
        <div className='flex flex-col text-left px-4 py-3'>
            <div className='flex justify-between items-center mb-3'>
                <div>
                    <h3 className='text-sm font-medium'>Files</h3>
                    {inputMode === 'form'
                        ? fileUploadState.files[0].map((file) => (
                              <FileListItem key={file.name} name={file.name} size={file.size} status={file.type} />
                          ))
                        : Object.entries(fileUploadState.files).flatMap(([submissionId, files]) => [
                              <h4 key={submissionId} className='text-xs font-medium py-2'>
                                  {submissionId}
                              </h4>,
                              ...files.map((file) => (
                                  <FileListItem key={file.name} name={file.name} size={file.size} status={file.type} />
                              )),
                          ])}
                    <ul></ul>
                </div>
            </div>

            <button
                onClick={() => setFileUploadState(undefined)}
                data-testid={`discard_${fileField}`}
                className='text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50'
                disabled={false /* TODO - when should the button be disabled? */}
            >
                Discard files
            </button>
        </div>
    );
};

type FileListeItemProps = {
    name: string;
    size: number;
    status: UploadStatus;
};

const FileListItem: FC<FileListeItemProps> = ({ name, size, status }) => {
    return (
        <div className='flex flex-row'>
            <div className='w-3.5' />
            <LucideFile className='h-4 w-4 text-gray-500 ml-1 mr-1' />
            <div className='flex-1 min-w-0 flex items-center'>
                <span className='text-xs text-gray-700 truncate max-w-[140px]'>{name}</span>
                <span className='text-xs text-gray-400 ml-2 whitespace-nowrap'>({formatFileSize(size)})</span>
            </div>
            {/* Status icon */}
            <div className='ml-2 w-5 flex justify-center'>{getStatusIcon(status)}</div>
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
