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

export type Uploaded = {
    type: 'uploaded';
    fileId: string;
    path: string;
    size: number;
};

export type PreviousUpload = {
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
    files: (Uploaded | PreviousUpload)[];
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

/**
 * Whether any file category still has an upload in flight. Submission must not proceed while
 * this is true: the file mapping is only updated once a category reaches 'uploadCompleted', so
 * submitting earlier would reference stale (or missing) file ids.
 */
export const hasUploadsInProgress = (fileUploadStates: Map<string, FileUploadState>): boolean =>
    Array.from(fileUploadStates.values()).some((state) => state.type !== 'uploadCompleted');

export const uploadsInProgressMessage = 'Please wait for all files to finish uploading.';

export const validateFileUploadStates = (fileUploadStates: Map<string, FileUploadState>): Result<void, Error> => {
    if (hasUploadsInProgress(fileUploadStates)) return err(new Error(uploadsInProgressMessage));

    return ok();
};
