import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import { backendClientHooks } from '../../../services/serviceHooks';
import type { FileMapping, Group } from '../../../types/backend';
import type { ClientConfig } from '../../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../../utils/createAuthorizationHeader';

type DummyRawReadUploadProps = {
    fileField: string;
    accessToken: string;
    clientConfig: ClientConfig;
    group: Group;
    setFileMapping: Dispatch<SetStateAction<FileMapping | undefined>>;
    onSuccess: () => void;
    onError: (message: string) => void;
};

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

export const DummyRawReadUpload: FC<DummyRawReadUploadProps> = ({
    accessToken,
    clientConfig,
    group,
    setFileMapping,
    onSuccess,
    onError,
}) => {
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
                // TODO use the URL to upload the file
                break;
            }
            case 'uploaded': {
                // TODO call setFileMapping
                setFileMapping(undefined);
                onSuccess();
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
