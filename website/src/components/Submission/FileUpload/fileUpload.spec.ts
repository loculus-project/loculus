import { describe, expect, it } from 'vitest';

import { validateFileUploadStates, type FileUploadState } from './fileUpload';

const uploaded = { type: 'uploaded', fileId: 'file-1', path: 'a.txt', size: 7 } as const;
const previousUpload = { type: 'previousUpload', fileId: 'file-2', path: 'b.txt' } as const;

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
