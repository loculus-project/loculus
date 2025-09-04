import { readFileSync } from 'fs';

import { ACCESSION_FIELD } from '../../src/settings.ts';
import type { Accession } from '../../src/types/backend.ts';
import { fastaEntryToString, parseFasta } from '../../src/utils/parseFasta.ts';
import { metadataTestFile, sequencesTestFile, testSequenceCount } from '../e2e.fixture.ts';

type FileContent = {
    metadataContent: string;
    sequenceFileContent: string;
};
export const createFileContent = (numberOfSequenceEntries: number): FileContent => {
    const metadataFileContent = readFileSync(metadataTestFile, 'utf-8');
    if (numberOfSequenceEntries > metadataFileContent.length - 1) {
        throw new Error(
            `ReviseTestPage: expected max ${metadataFileContent.length - 1} accessions, got ${numberOfSequenceEntries}`,
        );
    }
    const metadataContent = metadataFileContent
        .split('\n')
        .filter((line) => line.length > 0)
        .slice(0, numberOfSequenceEntries + 1)
        .join('\n');

    const sequenceFileContent = fastaEntryToString(
        parseFasta(readFileSync(sequencesTestFile, 'utf-8')).slice(0, numberOfSequenceEntries),
    );

    return { metadataContent, sequenceFileContent };
};
export const createModifiedFileContent = (accessions: Accession[]): FileContent => {
    if (accessions.length > testSequenceCount) {
        throw new Error(`ReviseTestPage: expected max ${testSequenceCount} accessions, got ${accessions.length}`);
    }

    const metadataRows = readFileSync(metadataTestFile, 'utf-8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

    if (accessions.length > metadataRows.length - 1) {
        throw new Error(`ReviseTestPage: expected max ${metadataRows.length - 1} accessions, got ${accessions.length}`);
    }

    metadataRows[0].push(ACCESSION_FIELD);
    for (let i = 1; i < metadataRows.length && i - 1 < accessions.length; i++) {
        metadataRows[i].push(accessions[i - 1]);
    }

    const metadataContent = metadataRows
        .map((row) => row.join('\t'))
        .slice(0, accessions.length + 1)
        .join('\n');

    const sequenceFileContent = fastaEntryToString(
        parseFasta(readFileSync(sequencesTestFile, 'utf-8')).slice(0, accessions.length),
    );

    return { metadataContent, sequenceFileContent };
};
