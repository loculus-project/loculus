import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';

import useClientFlag from '../../../hooks/isClient';
import type { FileMapping, Group } from '../../../types/backend';
import type { ClientConfig } from '../../../types/runtimeConfig';
import type { InputMode } from '../FormOrUploadWrapper';
import LucideFolderUp from '~icons/lucide/folder-up';
import { backendClientHooks } from '../../../services/serviceHooks';
import { createAuthorizationHeader } from '../../../utils/createAuthorizationHeader';

type AwaitingUrlState = {
    type: 'awaitingUrls';
    files: {
        file: File,
        name: string
    }[]
};

type UploadInProgressState = {
    type: 'uploadInProgress',
    files: (Pending | Uploading | Uploaded | Error)[]
}

type Pending = {
    type: 'pending';
    file: File;
    name: string;
    url: string;
    fileId: string;
};

type Uploading = {
    type: 'uploading';
    fileId: string;
    name: string;
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
    const [fileUploadState, setFileUploadState] = useState<AwaitingUrlState | UploadInProgressState | undefined>(undefined);

    const { mutateAsync } = backendClientHooks(clientConfig).useRequestUpload({
        headers: createAuthorizationHeader(accessToken),
        queries: {
            groupId: group.groupId,
            numberFiles: 10
        }
    });


    // files get selected by the user, get all put into some data structure -> status: 'awaitingUrl'
    // A handler is triggered to request Upload URLs and attaches them to the files -> status: 'pending'
    // Another handler is triggered and parallel uploads the files: -> status: 'uploading'

    const handleButton = () => {
        setFileUploadState({
            type: 'awaitingUrls',
            files: [
                {
                    file: new File(['Hello World!'], 'hello_world.txt', { type: 'text/plain' }),
                    name: 'hello.txt'
                }
            ]
        })
    };

    useEffect(() => {
        console.log("in effect");
            if (fileUploadState === undefined) return;

            if (fileUploadState.type === 'awaitingUrls') {
                console.log("in effect -> awaiting ULRs ... going to request URLs.")
                const awaitingUrl = fileUploadState.files;

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
                    console.log("received URLs")
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
                    console.log("Upload complete for all!");
                }
            };
    }, [fileUploadState]);

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);

            setFileUploadState({
                type: 'awaitingUrls',
                files: filesArray.map(file => ({ file, name: file.name}))
            })
        }
    };

    return (
        <div className='flex flex-col items-center justify-center flex-1 py-2 px-4'>
            <LucideFolderUp className={`mx-auto mt-4 mb-2 h-12 w-12text-gray-300`} aria-hidden='true' />
            <div>
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
            </div>
            <p className='text-sm pt-2 leading-5 text-gray-600'>Upload an entire folder of raw read files</p>
        </div>
    );

    return <button onClick={handleButton}>Upload dummy file</button>;
};
