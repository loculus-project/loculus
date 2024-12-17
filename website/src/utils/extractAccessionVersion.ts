import type { AccessionVersion } from '../types/backend.ts';

export const extractAccessionVersion = (accessionVersion: AccessionVersion) => ({
    accession: accessionVersion.accession,
    version: accessionVersion.version,
});

export const getAccessionVersionString = (accessionVersion: Partial<AccessionVersion> | string) => {
    if (typeof accessionVersion === 'string') {
        return accessionVersion;
    }
    return `${accessionVersion.accession}.${accessionVersion.version}`;
};

export const parseAccessionVersionFromString = (accessionVersionString: string) => {
    const parts = accessionVersionString.split('.');

    switch (parts.length) {
        case 1:
            return { accession: parts[0], version: undefined };
        default: {
            const version = Number(parts.pop());
            const accession = parts.join('.');
            return { accession, version: isNaN(version) ? undefined : version };
        }
    }
};
