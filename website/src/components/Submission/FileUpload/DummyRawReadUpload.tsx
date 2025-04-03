import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';

import { backendClientHooks } from '../../../services/serviceHooks';
import type { FileMapping, Group } from '../../../types/backend';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../../utils/createAuthorizationHeader';
import type { InputMode } from '../FormOrUploadWrapper';

type AwaitingUrl = {
    type: 'awaitingUrl';
    file: File;
};

type Pending = {
    type: 'pending';
    file: File;
    url: string;
    fileId: string;
};

type Uploaded = {
    type: 'uploaded';
    fileId: string;
};

type Error = {
    type: 'error';
    msg: string;
};

type FileToUpload = AwaitingUrl | Pending | Uploaded | Error;

type UploadedFile = {
    submissionId: string | undefined;  // submission ID only present for bulk uploads
    fileField: string;
    fileId: string;
    name: string;

}

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
                    onError: (error) => {
                        onError(`Failed to request upload: ${error.message}`);
                        setFileToUpload(undefined);
                    },
                });
                break;
            }
            case 'pending': {
                toast.info("Uploading ...")
                fetch(fileToUpload.url, {
                    method: "PUT",
                    headers: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        "Content-Type": fileToUpload.file.type,
                    },
                    body: fileToUpload.file,
                })
                .then(response => {
                    if (response.ok) {
                        toast.info(`Upload finished! ${fileToUpload.fileId}`)
                        setFileToUpload({
                            type: 'uploaded',
                            fileId: fileToUpload.fileId
                        })
                    } else {
                        onError("Error lol")
                        setFileToUpload(undefined)
                    }
                })
                .catch(error => {
                    onError(error.message)
                })
                .finally(() => {
                    toast.info("finally")
                })
                break;
            }
            case 'uploaded': {
                // TODO call setFileMapping
                setFileMapping({
                    'submissionId': {
                        [fileField]: [
                            // TODO use fileToUpload
                            {fileId: fileToUpload.fileId, name: "foo.txt"}
                        ]
                    }
                });
                toast.info("Uploaded!")
                break;
            }
            case 'error': {
                // TODO
                break;
            }
        }
    }, [fileToUpload]);

    return <button onClick={handleButton}>Upload dummy file</button>;
};
