import type { AccessionVersion } from '../types/backend.ts';

export const extractAccessionVersion = (accessionVersion: AccessionVersion) => ({
    accession: accessionVersion.accession,
    version: accessionVersion.version,
});

export const getAccessionVersionString = (accessionVersion: AccessionVersion | string) => {
    if (typeof accessionVersion === 'string') {
        return accessionVersion;
    }
    return `${accessionVersion.accession}.${accessionVersion.version}`;
};
