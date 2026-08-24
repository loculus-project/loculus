import { type Result } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import {
    applyFileMappings,
    resolveFileMappings,
    getLinkageErrorMessage,
    getLinkageErrors,
    LinkageType,
    parseSubmissionFileMapping,
    type FileLinkage,
    type FileMapping,
    type SubmissionFile,
    type SubmissionFileMapping,
} from './fileMapping';
import { FILES_HEADER_PREFIX } from '../../../settings';

const RAW_READS = 'rawReads';
const RAW_READS_COLUMN = `${FILES_HEADER_PREFIX}${RAW_READS}`;
const OTHER_FILES = 'otherFiles';
const OTHER_FILES_COLUMN = `${FILES_HEADER_PREFIX}${OTHER_FILES}`;
const FILE_CATEGORIES = [RAW_READS, OTHER_FILES];

const tsv = (rows: string[][]) => rows.map((row) => row.join('\t')).join('\n');
const declaredFile = (name: string, path: string = name) => ({ type: 'declaredFile' as const, name, path });
const reusedFile = (name: string, fileId: string) => ({ type: 'reusedFile' as const, name, fileId });
const uploadedFile = (path: string, fileId: string) => ({ type: 'uploadedFile' as const, path, fileId });
const linkedFile = (name: string, path: string, fileId: string) => ({
    type: 'linkedFile' as const,
    name,
    path,
    fileId,
});
const resolvedFile = (name: string, fileId: string) => ({ type: 'resolvedFile' as const, name, fileId });

const valueOf = <T>(result: Result<T, Error>): T => {
    if (result.isErr()) throw new Error(`expected a success, got: ${result.error.message}`);
    return result.value;
};

const errorMessageOf = <T>(result: Result<T, Error>): string => {
    if (result.isOk()) throw new Error('expected a failure, got a success');
    return result.error.message;
};

const entriesOf = (text: string, submissionId: string, category: string) => {
    const mapping = valueOf(parseSubmissionFileMapping(text, FILE_CATEGORIES));
    return [...(mapping.get(submissionId)?.get(category)?.values() ?? [])];
};

const errorOf = (text: string, categories: string[] = FILE_CATEGORIES): string => {
    const result = parseSubmissionFileMapping(text, categories);
    if (result.isOk()) throw new Error('expected the parse to fail');
    return result.error.message;
};

const fileMappingOf = (categories: Record<string, { path: string; fileId: string }[]>): FileMapping =>
    new Map(
        Object.entries(categories).map(([category, files]) => [
            category,
            new Map(files.map((f) => [f.path, f.fileId])),
        ]),
    );

const submissionMappingOf = (submissions: Record<string, Record<string, SubmissionFile[]>>): SubmissionFileMapping =>
    new Map(
        Object.entries(submissions).map(([submissionId, categories]) => [
            submissionId,
            new Map(
                Object.entries(categories).map(([category, files]) => [
                    category,
                    new Map(files.map((file) => [file.name, file])),
                ]),
            ),
        ]),
    );

const resolvedMappingOf = (submissions: Record<string, Record<string, { name: string; fileId: string }[]>>) =>
    new Map(
        Object.entries(submissions).map(([submissionId, categories]) => [
            submissionId,
            new Map(
                Object.entries(categories).map(([category, files]) => [
                    category,
                    new Map(files.map((file) => [file.name, resolvedFile(file.name, file.fileId)])),
                ]),
            ),
        ]),
    );

describe('parseSubmissionFileMapping', () => {
    it('parses every accepted file entry form', () => {
        const text = tsv([
            ['id', RAW_READS_COLUMN],
            ['e1', 'a.txt b.txt::sub/b.txt c.txt:id-c'],
        ]);
        expect(entriesOf(text, 'e1', RAW_READS)).toEqual([
            declaredFile('a.txt'),
            declaredFile('b.txt', 'sub/b.txt'),
            reusedFile('c.txt', 'id-c'),
        ]);
    });

    it('rejects entries that do not match any accepted form', () => {
        const tsvs = [
            tsv([
                ['id', RAW_READS_COLUMN],
                ['e1', 'a::b::c'],
            ]),
            tsv([
                ['id', RAW_READS_COLUMN],
                ['e1', 'a.txt::sub/a.txt:id-a'],
            ]),
        ];
        for (const t of tsvs) expect(errorOf(t)).toContain('Failed to parse file entry');
    });

    it('ignores extra whitespace between entries', () => {
        const text = tsv([
            ['id', RAW_READS_COLUMN],
            ['e1', '  a.txt   b.txt  '],
        ]);
        expect(entriesOf(text, 'e1', RAW_READS).map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
    });

    it('rejects entries containing whitespace', () => {
        const text = tsv([
            ['id', RAW_READS_COLUMN],
            ['e1', 'my\vreads.fastq'],
        ]);
        expect(errorOf(text)).toContain('may not contain whitespace');
    });

    it('returns an empty mapping when there are no file columns', () => {
        const result = parseSubmissionFileMapping(
            tsv([
                ['id', 'country'],
                ['e1', 'CH'],
            ]),
            FILE_CATEGORIES,
        );
        expect(valueOf(result)).toEqual(new Map());
        expect(valueOf(parseSubmissionFileMapping(tsv([['country'], ['CH']]), FILE_CATEGORIES))).toEqual(new Map());
    });

    it('rejects a file column without an id column', () => {
        expect(errorOf(tsv([[RAW_READS_COLUMN], ['a.txt']]))).toContain('Missing id column');
    });

    it.each(['id', 'submissionId'])('accepts %s as the id column', (idColumn) => {
        const text = tsv([
            [idColumn, RAW_READS_COLUMN],
            ['e1', 'a.txt'],
        ]);
        expect(entriesOf(text, 'e1', RAW_READS).map((f) => f.name)).toEqual(['a.txt']);
    });

    it('rejects an empty id value', () => {
        const text = tsv([
            ['id', RAW_READS_COLUMN],
            ['', 'a.txt'],
        ]);
        expect(errorOf(text)).toContain('Found empty id value');
    });

    it('rejects duplicate ids', () => {
        const text = tsv([
            ['id', RAW_READS_COLUMN],
            ['e1', 'a.txt'],
            ['e1', 'b.txt'],
        ]);
        expect(errorOf(text)).toContain('Found duplicate ids within metadata file: e1');
    });

    it('rejects duplicate file categories', () => {
        const text = tsv([
            ['id', RAW_READS_COLUMN, RAW_READS_COLUMN],
            ['e1', 'a.txt', 'b.txt'],
        ]);
        expect(errorOf(text)).toContain(`Found duplicate file categories within metadata file: ${RAW_READS}`);
    });

    it('rejects duplicate file names within one entry', () => {
        const text = tsv([
            ['id', RAW_READS_COLUMN],
            ['e1', 'a.txt::one/a.txt a.txt::two/a.txt'],
        ]);
        expect(errorOf(text)).toContain(`Found duplicate file names for entry e1 in the ${RAW_READS} category: a.txt`);
    });

    it('allows two different names to share the same explicit path', () => {
        const text = tsv([
            ['id', RAW_READS_COLUMN],
            ['e1', 'a.txt::x b.txt::x'],
        ]);
        expect(entriesOf(text, 'e1', RAW_READS)).toEqual([declaredFile('a.txt', 'x'), declaredFile('b.txt', 'x')]);
    });

    it('omits the category entirely for an empty cell', () => {
        const text = tsv([
            ['id', RAW_READS_COLUMN, OTHER_FILES_COLUMN],
            ['e1', 'a.txt', ''],
        ]);
        const result = valueOf(parseSubmissionFileMapping(text, FILE_CATEGORIES));
        expect([...result.get('e1')!.keys()]).toEqual([RAW_READS]);
    });

    it('parses several categories across several entries', () => {
        const text = tsv([
            ['id', 'country', RAW_READS_COLUMN, OTHER_FILES_COLUMN],
            ['e1', 'CH', 'a.txt', 'a.json'],
            ['e2', 'DE', 'b.txt', 'b.json'],
        ]);
        const result = valueOf(parseSubmissionFileMapping(text, FILE_CATEGORIES));
        expect([...result.keys()]).toEqual(['e1', 'e2']);
        expect(entriesOf(text, 'e1', OTHER_FILES).map((f) => f.name)).toEqual(['a.json']);
        expect(entriesOf(text, 'e2', RAW_READS).map((f) => f.name)).toEqual(['b.txt']);
    });
});

describe('resolveFileMappings', () => {
    const metadataEntry = declaredFile('a.txt');
    const metadataEntryWithFileId = reusedFile('a.txt', 'existing-id');
    const uploadEntry = uploadedFile('a.txt', 'uploaded-id');
    const linkedEntry = linkedFile('a.txt', 'a.txt', 'uploaded-id');
    const emptyDetails = { linked: [], reused: [], missing: [], orphaned: [], shadowed: [] };

    describe('linked', () => {
        it('when a metadata entry references an uploaded file', () => {
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { [RAW_READS]: [metadataEntry] } }),
                fileMappingOf({ [RAW_READS]: [uploadEntry] }),
            );
            expect(fileLinkage.get(RAW_READS)).toEqual({ ...emptyDetails, linked: [linkedEntry] });
            expect(submissionFileMapping.get('e1')!.get(RAW_READS)!.get('a.txt')!.fileId).toBe('uploaded-id');
        });

        it('when several metadata entries reference the same uploaded file', () => {
            const { fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { [RAW_READS]: [metadataEntry] }, e2: { [RAW_READS]: [metadataEntry] } }),
                fileMappingOf({ [RAW_READS]: [uploadEntry] }),
            );
            // Every metadata entry claiming the upload is listed, so the upload appears once per entry
            expect(fileLinkage.get(RAW_READS)).toEqual({ ...emptyDetails, linked: [linkedEntry, linkedEntry] });
        });

        it('when one metadata entry has its own file ID but another references the uploaded file', () => {
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({
                    e1: { [RAW_READS]: [metadataEntryWithFileId] },
                    e2: { [RAW_READS]: [metadataEntry] },
                }),
                fileMappingOf({ [RAW_READS]: [uploadEntry] }),
            );
            expect(fileLinkage.get(RAW_READS)).toEqual({
                ...emptyDetails,
                linked: [linkedEntry],
                reused: [metadataEntryWithFileId],
            });
            expect(submissionFileMapping.get('e1')!.get(RAW_READS)!.get('a.txt')!.fileId).toBe('existing-id');
            expect(submissionFileMapping.get('e2')!.get(RAW_READS)!.get('a.txt')!.fileId).toBe('uploaded-id');
        });
    });

    describe('reused', () => {
        it('when a metadata entry has its own file ID', () => {
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { [RAW_READS]: [metadataEntryWithFileId] } }),
                fileMappingOf({}),
            );
            expect(fileLinkage.get(RAW_READS)).toEqual({ ...emptyDetails, reused: [metadataEntryWithFileId] });
            expect(submissionFileMapping.get('e1')!.get(RAW_READS)!.get('a.txt')!.fileId).toBe('existing-id');
            expect(getLinkageErrors(fileLinkage)).toBeUndefined();
        });
    });

    describe('missing', () => {
        it('when a metadata entry has no file ID and no uploaded file', () => {
            const otherUpload = uploadedFile('b.txt', 'uploaded-b');
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { [RAW_READS]: [metadataEntry] } }),
                fileMappingOf({ [RAW_READS]: [otherUpload] }),
            );
            expect(fileLinkage.get(RAW_READS)).toEqual({
                ...emptyDetails,
                missing: [metadataEntry],
                orphaned: [otherUpload],
            });
            expect(submissionFileMapping.size).toBe(0);
        });
    });

    describe('orphaned', () => {
        it('when an uploaded file has no corresponding metadata entry', () => {
            const { fileLinkage } = resolveFileMappings(new Map(), fileMappingOf({ [RAW_READS]: [uploadEntry] }));
            expect(fileLinkage.get(RAW_READS)).toEqual({ ...emptyDetails, orphaned: [uploadEntry] });
        });
    });

    describe('shadowed', () => {
        it('when every metadata entry on the path has its own file ID, so none of them claim the upload', () => {
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { [RAW_READS]: [metadataEntryWithFileId] } }),
                fileMappingOf({ [RAW_READS]: [uploadEntry] }),
            );
            expect(fileLinkage.get(RAW_READS)).toEqual({
                ...emptyDetails,
                reused: [metadataEntryWithFileId],
                shadowed: [uploadEntry],
            });
            expect(submissionFileMapping.get('e1')!.get(RAW_READS)!.get('a.txt')!.fileId).toBe('existing-id');
        });
    });

    describe('file categories', () => {
        it('are covered when present on only one side', () => {
            const jsonEntry = declaredFile('a.json');
            const { fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { [OTHER_FILES]: [jsonEntry] } }),
                fileMappingOf({ [RAW_READS]: [uploadEntry] }),
            );
            expect([...fileLinkage.keys()].sort()).toEqual([OTHER_FILES, RAW_READS]);
            expect(fileLinkage.get(OTHER_FILES)).toEqual({ ...emptyDetails, missing: [jsonEntry] });
            expect(fileLinkage.get(RAW_READS)).toEqual({ ...emptyDetails, orphaned: [uploadEntry] });
        });
    });
});

describe('getLinkageErrors', () => {
    it('displays problems across categories', () => {
        const fileLinkage: FileLinkage = new Map([
            [RAW_READS, { linked: [], reused: [], missing: [declaredFile('a.txt')], orphaned: [], shadowed: [] }],
            [
                OTHER_FILES,
                { linked: [], reused: [], missing: [], orphaned: [uploadedFile('b.json', '123')], shadowed: [] },
            ],
        ]);
        expect(getLinkageErrors(fileLinkage)).toBe(
            `${getLinkageErrorMessage(LinkageType.MISSING, RAW_READS, 'a.txt')} ${getLinkageErrorMessage(LinkageType.ORPHANED, OTHER_FILES, 'b.json')}`,
        );
    });
});

describe('applyFileMappings', () => {
    const metadataFile = (rows: string[][]) => new File([tsv(rows)], 'metadata.tsv');
    const linesOf = async (file: File) => (await file.text()).split('\n');

    it('writes name:fileId into an existing file column', async () => {
        const merged = resolvedMappingOf({ e1: { [RAW_READS]: [{ name: 'a.txt', fileId: 'id-a' }] } });
        const result = await applyFileMappings(
            metadataFile([
                ['id', RAW_READS_COLUMN],
                ['e1', 'a.txt'],
            ]),
            merged,
        );
        expect(await linesOf(valueOf(result))).toEqual([`id\t${RAW_READS_COLUMN}`, 'e1\ta.txt:id-a']);
    });

    it('joins several files in one cell', async () => {
        const merged = resolvedMappingOf({
            e1: {
                [RAW_READS]: [
                    { name: 'a.txt', fileId: 'id-a' },
                    { name: 'b.txt', fileId: 'id-b' },
                ],
            },
        });
        const result = await applyFileMappings(
            metadataFile([
                ['id', RAW_READS_COLUMN],
                ['e1', ''],
            ]),
            merged,
        );
        expect(await linesOf(valueOf(result))).toEqual([`id\t${RAW_READS_COLUMN}`, 'e1\ta.txt:id-a b.txt:id-b']);
    });

    it('rejects a category in the file mapping which has no column in the metadata', async () => {
        const merged = resolvedMappingOf({ e1: { [RAW_READS]: [{ name: 'a.txt', fileId: 'id-a' }] } });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'country'],
                ['e1', 'CH'],
            ]),
            merged,
        );
        expect(errorMessageOf(result)).toContain(`Encountered unknown category ${RAW_READS} not present in metadata`);
    });
});
