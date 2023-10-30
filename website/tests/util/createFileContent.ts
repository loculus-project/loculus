import { readFileSync } from 'fs';

import type { SequenceId } from '../../src/types/backend.ts';
import { fastaEntryToString, parseFasta } from '../../src/utils/parseFasta.ts';
import { metadataTestFile, sequencesTestFile, testSequenceCount } from '../e2e.fixture.ts';

type FileContent = {
    metadataContent: string;
    sequenceFileContent: string;
};
export const createFileContent = (numberOfSequences: number): FileContent => {
    const metadataFileContent = readFileSync(metadataTestFile, 'utf-8');
    if (numberOfSequences > metadataFileContent.length - 1) {
        throw new Error(
            `ReviseTestPage: expected max ${metadataFileContent.length - 1} sequence ids, got ${numberOfSequences}`,
        );
    }
    const metadataContent = metadataFileContent
        .split('\n')
        .filter((line) => line.length > 0)
        .slice(0, numberOfSequences + 1)
        .join('\n');

    const sequenceFileContent = fastaEntryToString(
        parseFasta(readFileSync(sequencesTestFile, 'utf-8')).slice(0, numberOfSequences),
    );

    return { metadataContent, sequenceFileContent };
};
export const createModifiedFileContent = (sequenceIds: SequenceId[]): FileContent => {
    if (sequenceIds.length > testSequenceCount) {
        throw new Error(`ReviseTestPage: expected max ${testSequenceCount} sequence ids, got ${sequenceIds.length}`);
    }

    const metadataRows = readFileSync(metadataTestFile, 'utf-8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

    if (sequenceIds.length > metadataRows.length - 1) {
        throw new Error(
            `ReviseTestPage: expected max ${metadataRows.length - 1} sequence ids, got ${sequenceIds.length}`,
        );
    }

    metadataRows[0].push('sequenceId');
    for (let i = 1; i < metadataRows.length && i - 1 < sequenceIds.length; i++) {
        metadataRows[i].push(sequenceIds[i - 1].toString());
    }

    const metadataContent = metadataRows
        .map((row) => row.join('\t'))
        .slice(0, sequenceIds.length + 1)
        .join('\n');

    const sequenceFileContent = fastaEntryToString(
        parseFasta(readFileSync(sequencesTestFile, 'utf-8')).slice(0, sequenceIds.length),
    );

    return { metadataContent, sequenceFileContent };
};
