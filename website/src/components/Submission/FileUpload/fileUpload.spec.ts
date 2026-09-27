import { describe, expect, it } from 'vitest';

import {
    deriveFileMapping,
    getPreviousFileUploadStates,
    validateFileUploadStates,
    type FileUploadState,
    type Pending,
} from './fileUpload';

const RAW_READS = 'rawReads';
const ANNOTATIONS = 'annotations';

const uploaded = { type: 'uploaded', fileId: 'file-1', path: 'uploaded.txt', size: 7 } as const;
const previousUpload = { type: 'previousUpload', fileId: 'file-2', path: 'previousUpload.txt' } as const;
const awaiting = { type: 'awaiting', file: new File([], 'awaiting.txt'), path: 'awaiting.txt', size: 7 } as const;
const pending: Pending = {
    type: 'pending',
    file: new File([], 'pending.txt'),
    path: 'pending.txt',
    size: 7,
    fileId: 'file-3',
    urls: ['url'],
    uploadedParts: 0,
    totalParts: 1,
    partSize: 7,
};
const errored = { type: 'error', path: 'errored.txt', size: 7, msg: 'upload failed' } as const;

const submittedReads = { fileId: 'file-4', name: 'reads.fastq' };
const submittedAnnotations = { fileId: 'file-5', name: 'annotations.gff' };

describe('validateFileUploadStates', () => {
    it('accepts a submission without any file categories', () => {
        expect(validateFileUploadStates(new Map()).isOk()).toBeTruthy();
    });

    it('accepts categories whose uploads have all completed', () => {
        const result = validateFileUploadStates(
            new Map<string, FileUploadState>([
                [RAW_READS, { type: 'uploadCompleted', files: [uploaded] }],
                [ANNOTATIONS, { type: 'uploadCompleted', files: [previousUpload] }],
            ]),
        );

        expect(result.isOk()).toBeTruthy();
    });

    it('rejects a category which is still awaiting upload urls', () => {
        const result = validateFileUploadStates(
            new Map<string, FileUploadState>([[RAW_READS, { type: 'awaitingUrls', files: [] }]]),
        );

        expect(result.isErr()).toBeTruthy();
        expect(result._unsafeUnwrapErr().message).toContain('wait for all files to finish uploading');
    });

    it('rejects a category whose upload is still in progress', () => {
        const result = validateFileUploadStates(
            new Map<string, FileUploadState>([
                [RAW_READS, { type: 'uploadCompleted', files: [uploaded] }],
                [ANNOTATIONS, { type: 'uploadInProgress', files: [uploaded] }],
            ]),
        );

        expect(result.isErr()).toBeTruthy();
        expect(result._unsafeUnwrapErr().message).toContain('wait for all files to finish uploading');
    });
});

describe('deriveFileMapping', () => {
    it('returns undefined when no files have been uploaded', () => {
        expect(deriveFileMapping(new Map())).toBeUndefined();
        expect(
            deriveFileMapping(
                new Map<string, FileUploadState>([
                    [RAW_READS, { type: 'awaitingUrls', files: [awaiting] }],
                    [ANNOTATIONS, { type: 'uploadInProgress', files: [pending] }],
                ]),
            ),
        ).toBeUndefined();
    });

    it('maps the path of every uploaded and previously uploaded file to its file id', () => {
        const mapping = deriveFileMapping(
            new Map<string, FileUploadState>([
                [
                    RAW_READS,
                    { type: 'uploadInProgress', files: [uploaded, previousUpload, awaiting, pending, errored] },
                ],
                [ANNOTATIONS, { type: 'uploadCompleted', files: [previousUpload] }],
            ]),
        );

        expect(mapping).toEqual(
            new Map([
                [
                    RAW_READS,
                    new Map([
                        [uploaded.path, uploaded.fileId],
                        [previousUpload.path, previousUpload.fileId],
                    ]),
                ],
                [ANNOTATIONS, new Map([[previousUpload.path, previousUpload.fileId]])],
            ]),
        );
    });

    it('omits categories without any uploaded files', () => {
        const mapping = deriveFileMapping(
            new Map<string, FileUploadState>([
                [RAW_READS, { type: 'uploadCompleted', files: [uploaded] }],
                [ANNOTATIONS, { type: 'uploadInProgress', files: [pending] }],
            ]),
        );

        expect(mapping).toEqual(new Map([[RAW_READS, new Map([[uploaded.path, uploaded.fileId]])]]));
    });
});

describe('getPreviousFileUploadStates', () => {
    it('presents already submitted files as previous uploads', () => {
        const states = getPreviousFileUploadStates({
            [RAW_READS]: [submittedReads],
            [ANNOTATIONS]: [submittedAnnotations],
        });

        expect(states).toEqual(
            new Map([
                [
                    RAW_READS,
                    {
                        type: 'uploadCompleted',
                        files: [{ type: 'previousUpload', fileId: submittedReads.fileId, path: submittedReads.name }],
                    },
                ],
                [
                    ANNOTATIONS,
                    {
                        type: 'uploadCompleted',
                        files: [
                            {
                                type: 'previousUpload',
                                fileId: submittedAnnotations.fileId,
                                path: submittedAnnotations.name,
                            },
                        ],
                    },
                ],
            ]),
        );
    });

    it('omits categories without any files', () => {
        const states = getPreviousFileUploadStates({ [RAW_READS]: [submittedReads], [ANNOTATIONS]: [] });

        expect([...states.keys()]).toEqual([RAW_READS]);
    });
});
