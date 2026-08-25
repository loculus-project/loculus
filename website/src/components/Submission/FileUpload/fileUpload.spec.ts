import { describe, expect, it } from 'vitest';

import { deriveFileMapping, validateFileUploadStates, type FileUploadState, type Pending } from './fileUpload';

const uploaded = { type: 'uploaded', fileId: 'file-1', path: 'a.txt', size: 7 } as const;
const previousUpload = { type: 'previousUpload', fileId: 'file-2', path: 'b.txt' } as const;
const awaiting = { type: 'awaiting', file: new File([], 'c.txt'), path: 'c.txt', size: 7 } as const;
const pending: Pending = {
    type: 'pending',
    file: new File([], 'd.txt'),
    path: 'd.txt',
    size: 7,
    fileId: 'file-3',
    urls: ['url'],
    uploadedParts: 0,
    totalParts: 1,
    partSize: 7,
};

const statesOf = (...states: FileUploadState[]) => new Map(states.map((state, index) => [`category${index}`, state]));

describe('validateFileUploadStates', () => {
    it('accepts a submission without any file categories', () => {
        expect(validateFileUploadStates(new Map()).isOk()).toBeTruthy();
    });

    it('accepts categories whose uploads have all completed', () => {
        const result = validateFileUploadStates(
            statesOf(
                { type: 'uploadCompleted', files: [uploaded] },
                { type: 'uploadCompleted', files: [previousUpload] },
            ),
        );

        expect(result.isOk()).toBeTruthy();
    });

    it('rejects a category which is still awaiting upload urls', () => {
        const result = validateFileUploadStates(statesOf({ type: 'awaitingUrls', files: [] }));

        expect(result.isErr()).toBeTruthy();
        expect(result._unsafeUnwrapErr().message).toContain('wait for all files to finish uploading');
    });

    it('rejects a category whose upload is still in progress', () => {
        const result = validateFileUploadStates(
            statesOf({ type: 'uploadCompleted', files: [uploaded] }, { type: 'uploadInProgress', files: [uploaded] }),
        );

        expect(result.isErr()).toBeTruthy();
        expect(result._unsafeUnwrapErr().message).toContain('wait for all files to finish uploading');
    });
});

describe('deriveFileMapping', () => {
    it('returns undefined rather than an empty map when nothing has finished uploading', () => {
        // Callers treat undefined as "no file mapping to apply"; an empty map is not equivalent.
        expect(deriveFileMapping(new Map())).toBeUndefined();
        expect(
            deriveFileMapping(
                statesOf({ type: 'awaitingUrls', files: [awaiting] }, { type: 'uploadInProgress', files: [pending] }),
            ),
        ).toBeUndefined();
    });

    it('maps every completed category by path to file id', () => {
        const mapping = deriveFileMapping(
            statesOf(
                { type: 'uploadCompleted', files: [uploaded] },
                { type: 'uploadCompleted', files: [previousUpload] },
            ),
        );

        expect(mapping).toEqual(
            new Map([
                ['category0', new Map([['a.txt', 'file-1']])],
                ['category1', new Map([['b.txt', 'file-2']])],
            ]),
        );
    });

    it('includes a finished file while others in the same category are still in flight', () => {
        const mapping = deriveFileMapping(statesOf({ type: 'uploadInProgress', files: [uploaded, awaiting, pending] }));

        expect(mapping).toEqual(new Map([['category0', new Map([['a.txt', 'file-1']])]]));
    });

    it('yields the replacement file id for a replaced file, not the id it replaced', () => {
        // The regression this exists for: a file replaced on the edit page was submitted under
        // the fileId of the file it replaced, silently publishing the old content.
        const replaced = { type: 'uploaded', fileId: 'file-new', path: 'b.txt', size: 7 } as const;

        const mapping = deriveFileMapping(statesOf({ type: 'uploadCompleted', files: [uploaded, replaced] }));

        expect(mapping?.get('category0')?.get('b.txt')).toBe('file-new');
    });
});
