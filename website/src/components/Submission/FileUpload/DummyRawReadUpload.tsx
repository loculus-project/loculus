import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';

import useClientFlag from '../../../hooks/isClient';
import { backendClientHooks } from '../../../services/serviceHooks';
import type { FileMapping, Group } from '../../../types/backend';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../../utils/createAuthorizationHeader';
import type { InputMode } from '../FormOrUploadWrapper';
import LucideFolderUp from '~icons/lucide/folder-up';

type AwaitingUrlState = {
    type: 'awaitingUrls';
    files: {
        file: File,
        name: string
    }[]
};

type UploadInProgressState = {
    type: 'uploadInProgress',
    files: (Pending | Uploaded | Error)[]
}

type UploadCompleted = {
    type: 'uploadCompleted',
    files: Uploaded[]
}

type FileUploadState = AwaitingUrlState | UploadInProgressState | UploadCompleted;

type Pending = {
    type: 'pending';
    file: File;
    name: string;
    url: string;
    fileId: string;
};

type Uploaded = {
    type: 'uploaded';
    fileId: string;
    name: string;
};

type Error = {
    type: 'error';
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
            numberFiles: 10
        }
    });

    useEffect(() => {
        console.log("in effect");
            if (fileUploadState === undefined) return;

            if (fileUploadState.type === 'awaitingUrls') {
                const awaitingUrl = fileUploadState.files;

                // TODO -> why can't I set the variables here?!
                mutateAsync(undefined).then(val => {
                    const files: Pending[] = [];
                    for (let i = 0; i < awaitingUrl.length; i++) {
                        const fileId = val[i].fileId;
                        files.push({
                            type: 'pending',
                            file: awaitingUrl[i].file,
                            name: awaitingUrl[i].name,
                            url: val[i].url,
                            fileId
                        })
                        
                    }
                    setFileUploadState({
                        type: 'uploadInProgress',
                        files
                    })

                    // Initialize the uploads in parallel
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
                                setFileUploadState(state => {
                                    if (state?.type === 'uploadInProgress') {
                                        return {
                                            type: 'uploadInProgress',
                                            files: state.files.map(file => {
                                                if (file.type === 'pending' && file.fileId === fileId) {
                                                    if (response.ok) {
                                                        console.log(`Uploaded: ${file.name}!`);
                                                        return { type: 'uploaded', fileId: file.fileId, name: file.name };
                                                    } else {
                                                        return { type: 'error', msg: "error"};
                                                    }
                                                } else {
                                                    return file
                                                }
                                            })
                                        }
                                    }
                                    return state;
                                });
                            })
                            .catch((error: unknown) => {
                                if (error instanceof Error) {
                                    onError(error.message);
                                }
                            });
                    })

                });
                return;
            }

            if (fileUploadState.type === 'uploadInProgress') {
                if (fileUploadState.files.every(({ type }) => type === 'uploaded')) {
                    setFileUploadState({
                        type: 'uploadCompleted',
                        files: fileUploadState.files as Uploaded[]
                    })
                }
                return;
            };

            if (fileUploadState.type === 'uploadCompleted') {
                /*
                setFileMapping(currentMapping => {
                    const newValue = {[fileField]: }
                })
                */
                return;
            }
    }, [fileUploadState]);

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            filesArray.forEach(file => console.log(`${file.name} - ${file.webkitRelativePath} - ${file.type}`));

            setFileUploadState({
                type: 'awaitingUrls',
                files: filesArray.map(file => ({ file, name: file.name}))
            })
        }
    };

    return (fileUploadState === undefined || fileUploadState.type === 'awaitingUrls' ) ? (
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
                    <p>
                        Preparing upload ... 
                    </p>
                )}
            </div>
            <p className='text-sm pt-2 leading-5 text-gray-600'>Upload an entire folder of raw read files</p>
        </div>
    ) : (
        <div className='flex flex-col text-left px-4 py-3'>
            <div className='flex justify-between items-center mb-3'>
                <div>
                    <h3 className='text-sm font-medium'>Folder Structure</h3>
                    <ul>
                        {fileUploadState.files.map(file => {
                            switch (file.type) {
                                case 'pending': {
                                    return <li>{`${file.name} pending`}</li>;
                                }
                                case 'uploaded': {
                                    return <li>{`${file.name} uploaded`}</li>;
                                }
                                case 'error': {
                                    return <li>{file.msg}</li>;
                                }
                            }
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
};
