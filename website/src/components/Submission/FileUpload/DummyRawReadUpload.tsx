import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';

import useClientFlag from '../../../hooks/isClient';
import { backendClientHooks } from '../../../services/serviceHooks';
import type { FileMapping, Group } from '../../../types/backend';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../../utils/createAuthorizationHeader';
import type { InputMode } from '../FormOrUploadWrapper';
import LucideFolderUp from '~icons/lucide/folder-up';

type AwaitingUrl = {
    type: 'awaitingUrl';
    file: File;
    name: string;
};

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

type FileToUpload = AwaitingUrl | Pending | Uploaded | Error;

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
    // TODO - maybe use a list of files here?
    const [fileToUpload, setFileToUpload] = useState<FileToUpload | undefined>();

    const useRequestUpload = backendClientHooks(clientConfig).useRequestUpload({
        headers: createAuthorizationHeader(accessToken),
        queries: {
            groupId: group.groupId,
            numberFiles: 1, // hardcoded for now
        },
    });

    // files get selected by the user, get all put into some data structure -> status: 'awaitingUrl'
    // A handler is triggered to request Upload URLs and attaches them to the files -> status: 'pending'
    // Another handler is triggered and parallel uploads the files: -> status: 'uploading'

    const handleButton = () => {
        setFileToUpload({
            type: 'awaitingUrl',
            file: new File(['Hello World!'], 'hello_world.txt', { type: 'text/plain' }),
            name: 'hello_world.txt',
        });
    };

    useEffect(() => {
        if (fileToUpload === undefined) return;

        switch (fileToUpload.type) {
            case 'awaitingUrl': {
                useRequestUpload.mutate(undefined, {
                    onSuccess: (data) => {
                        /* eslint-disable */
                        console.log('Received URL: ' + JSON.stringify(data));
                        /* eslint-enable */
                        setFileToUpload({
                            ...fileToUpload,
                            type: 'pending',
                            fileId: data[0].fileId,
                            url: data[0].url,
                        });
                    },
                    onError: (error: unknown) => {
                        if (error instanceof Error) {
                            onError(`Failed to request upload: ${error.message}`);
                        }
                        setFileToUpload(undefined);
                    },
                });
                break;
            }
            case 'pending': {
                fetch(fileToUpload.url, {
                    method: 'POST',
                    headers: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        'Content-Type': fileToUpload.file.type,
                    },
                    body: fileToUpload.file,
                })
                    .then((response) => {
                        if (response.ok) {
                            setFileToUpload({
                                type: 'uploaded',
                                fileId: fileToUpload.fileId,
                                name: fileToUpload.name,
                            });
                        } else {
                            onError('Error uploading file.');
                            setFileToUpload(undefined);
                        }
                    })
                    .catch((error: unknown) => {
                        if (error instanceof Error) {
                            onError(error.message);
                        }
                    });
                break;
            }
            case 'uploaded': {
                setFileMapping({
                    submissionId: {
                        [fileField]: [{ fileId: fileToUpload.fileId, name: fileToUpload.name }],
                    },
                });
                toast.info('Uploaded!');
                break;
            }
            case 'error': {
                // TODO
                break;
            }
        }
    }, [fileToUpload]);

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);

            // TODO set all files
            setFileToUpload({
                type: 'awaitingUrl',
                file: filesArray[0],
                name: filesArray[0].name,
            });
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
