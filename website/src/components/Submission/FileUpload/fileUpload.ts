import { err, ok, Result } from 'neverthrow';

import type { FilesByCategory } from '../../../types/backend';

export type Awaiting = {
    type: 'awaiting';
    file: File;
    path: string;
};

export type Pending = {
    type: 'pending';
    file: File;
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
    path: string;
    size: number;
};

type PreviousUpload = {
    type: 'previousUpload';
    fileId: string;
    // Previous uploads only appear for form submissions/revisions
    // where we have a single folder of uniquely named files.
    // Therefore, name and path are equivalent
    path: string;
};

type FileError = {
    type: 'error';
    path: string;
    size: number;
    msg: string;
};

export type SingleFileUpload = Pending | Uploaded | PreviousUpload | FileError;

export type UploadStatus = 'pending' | 'uploaded' | 'previousUpload' | 'error';

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
    files: (Uploaded | PreviousUpload | FileError)[];
};

export type FileUploadState = AwaitingUrlState | UploadInProgressState | UploadCompleted;

export const getPreviousFileUploadStates = (files: FilesByCategory): Map<string, FileUploadState> =>
    new Map(
        Object.entries(files)
            .filter(([_, files]) => files.length > 0)
            .map(([category, files]) => [
                category,
                {
                    type: 'uploadCompleted',
                    // Previous uploads only appear for form submissions/revisions
                    // where we have a single folder of uniquely named files.
                    // Therefore, name and path are equivalent
                    files: files.map((f) => ({ type: 'previousUpload', fileId: f.fileId, path: f.name })),
                },
            ]),
    );

export const validateFileUploadStates = (fileUploadStates: Map<string, FileUploadState>): Result<void, Error> => {
    if (Array.from(fileUploadStates.values()).some((state) => state.type !== 'uploadCompleted'))
        return err(new Error('Please wait for all files to finish uploading before submitting.'));

    if (Array.from(fileUploadStates.values()).some((state) => state.files.some((file) => file.type === 'error')))
        return err(new Error('Please discard or replace any files that failed to upload before submitting.'));

    return ok();
};
