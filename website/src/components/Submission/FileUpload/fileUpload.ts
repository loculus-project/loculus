import { err, ok, Result } from 'neverthrow';

import type { FileMapping } from './fileMapping';
import type { FilesByCategory } from '../../../types/backend';

export type Awaiting = {
    type: 'awaiting';
    file: File;
    path: string;
    size: number;
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

export type SingleFileUpload = Awaiting | Pending | Uploaded | PreviousUpload | FileError;

export type UploadStatus = SingleFileUpload['type'];

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

const isUploaded = (file: SingleFileUpload): file is Uploaded | PreviousUpload =>
    file.type === 'uploaded' || file.type === 'previousUpload';

/**
 * The file mapping is derived from the upload states.
 * A file enters the mapping as soon as its own upload has finished, so files still uploading cannot be claimed as linked.
 */
export const deriveFileMapping = (fileUploadStates: Map<string, FileUploadState>): FileMapping | undefined => {
    const mapping: FileMapping = new Map(
        Array.from(fileUploadStates.entries()).flatMap(([category, state]) => {
            const uploads = [...state.files].filter(isUploaded);
            return uploads.length === 0
                ? []
                : [[category, new Map(uploads.map((file) => [file.path, file.fileId]))] as const];
        }),
    );
    return mapping.size === 0 ? undefined : mapping;
};

export const validateFileUploadStates = (fileUploadStates: Map<string, FileUploadState>): Result<void, Error> => {
    if (Array.from(fileUploadStates.values()).some((state) => state.type !== 'uploadCompleted'))
        return err(new Error('Please wait for all files to finish uploading before submitting.'));

    return ok();
};
