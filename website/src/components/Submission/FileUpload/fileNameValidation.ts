import { err, ok, Result } from 'neverthrow';

import type { FileSharingConfig } from '../../../types/config';

const FORBIDDEN_FILENAME_CHARACTERS_REGEX = /[<>:"/\\|?*;%#]/;
const RESERVED_DEVICE_NAME_REGEX = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const STRICT_FILENAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

const containsControlCharacter = (fileName: string): boolean => {
    for (let i = 0; i < fileName.length; i++) {
        if (fileName.charCodeAt(i) <= 31) return true;
    }
    return false;
};

/** Mirrors the restrictions enforced by the backend - any changes to validation here should also be reflected there. */
export const validateFileNames = (fileNames: string[], fileSharingConfig: FileSharingConfig): Result<void, Error[]> => {
    const errors: Error[] = [];

    for (const fileName of fileNames) {
        if (!fileSharingConfig.disableStrictFilenameValidation && !STRICT_FILENAME_REGEX.test(fileName)) {
            errors.push(
                new Error(
                    `Invalid filename '${fileName}': Filenames must only contain alphanumeric characters, underscores, periods and hyphens.`,
                ),
            );
            continue;
        }
        if (fileName === '') {
            errors.push(new Error(`Invalid filename '${fileName}': Filenames may not be empty.`));
            continue;
        }
        const fileNameBytes = new TextEncoder().encode(fileName);
        if (fileNameBytes.length > 255) {
            errors.push(
                new Error(
                    `Invalid filename '${fileName}': Filenames may not exceed 255 ${fileNameBytes.length > fileName.length ? 'bytes' : 'characters'}.`,
                ),
            );
            continue;
        }
        if (FORBIDDEN_FILENAME_CHARACTERS_REGEX.test(fileName)) {
            errors.push(
                new Error(
                    `Invalid filename '${fileName}': Filenames may not contain forbidden characters (< > : " / \\ | ? * ; % #).`,
                ),
            );
            continue;
        }
        if (containsControlCharacter(fileName)) {
            errors.push(
                new Error(`Invalid filename '${fileName}': Filenames may not contain ASCII control characters 0-31.`),
            );
            continue;
        }
        if (RESERVED_DEVICE_NAME_REGEX.test(fileName.split('.')[0])) {
            errors.push(
                new Error(
                    `Invalid filename '${fileName}': Filenames may not use Windows reserved device names (CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9).`,
                ),
            );
            continue;
        }
        if (fileName.endsWith('.')) {
            errors.push(new Error(`Invalid filename '${fileName}': Filenames may not end with a period.`));
            continue;
        }
        if (/\s/.test(fileName)) {
            errors.push(new Error(`Invalid filename '${fileName}': Filenames may not contain whitespace.`));
            continue;
        }
    }

    if (errors.length > 0) return err(errors);
    return ok();
};

export const getFileNameErrorMessage = (fileNameErrors: Error[], count: number = 5): string => {
    const shown = fileNameErrors
        .slice(0, count)
        .map((error) => error.message)
        .join(' ');
    const remaining = fileNameErrors.length - count;
    return remaining > 0 ? `${shown} ... [${remaining} more]` : shown;
};
