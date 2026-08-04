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

const tsv = (rows: string[][]) => rows.map((row) => row.join('\t')).join('\n');

// The file categories configured for the organism under test
const knownCategories = ['raw', 'processed'];

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

const entriesOf = (text: string, submissionId: string, category: string) => {
    const result = parseSubmissionFileMapping(text, knownCategories);
    if (result.isErr()) throw new Error(`expected a successful parse, got: ${result.error.message}`);
    return [...(result.value.get(submissionId)?.get(category)?.values() ?? [])];
};

const errorOf = (text: string, categories: string[] = knownCategories): string => {
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
            ['id', 'files.raw'],
            ['e1', 'a.txt b.txt::sub/b.txt c.txt:id-c'],
        ]);
        expect(entriesOf(text, 'e1', 'raw')).toEqual([
            declaredFile('a.txt'),
            declaredFile('b.txt', 'sub/b.txt'),
            reusedFile('c.txt', 'id-c'),
        ]);
    });

    it('rejects an entry with both a path and a file id', () => {
        const text = tsv([
            ['id', 'files.raw'],
            ['e1', 'a.txt::sub/a.txt:id-a'],
        ]);
        expect(errorOf(text)).toContain('Failed to parse file entry');
    });

    it('ignores extra whitespace between entries', () => {
        const text = tsv([
            ['id', 'files.raw'],
            ['e1', '  a.txt   b.txt  '],
        ]);
        expect(entriesOf(text, 'e1', 'raw').map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
    });

    it('rejects an entry that does not match any accepted form', () => {
        const text = tsv([
            ['id', 'files.raw'],
            ['e1', 'a::b::c'],
        ]);
        expect(errorOf(text)).toContain('Failed to parse file entry');
    });

    it('returns an empty mapping when there are no file columns', () => {
        const result = parseSubmissionFileMapping(
            tsv([
                ['id', 'country'],
                ['e1', 'CH'],
            ]),
            knownCategories,
        );
        expect(result._unsafeUnwrap()).toEqual(new Map());
        expect(parseSubmissionFileMapping(tsv([['country'], ['CH']]), knownCategories)._unsafeUnwrap()).toEqual(
            new Map(),
        );
    });

    it('rejects a file column without an id column', () => {
        expect(errorOf(tsv([['files.raw'], ['a.txt']]))).toContain('Missing id column');
    });

    it.each(['id', 'submissionId'])('accepts %s as the id column', (idColumn) => {
        const text = tsv([
            [idColumn, 'files.raw'],
            ['e1', 'a.txt'],
        ]);
        expect(entriesOf(text, 'e1', 'raw').map((f) => f.name)).toEqual(['a.txt']);
    });

    it('rejects an empty id value', () => {
        const text = tsv([
            ['id', 'files.raw'],
            ['', 'a.txt'],
        ]);
        expect(errorOf(text)).toContain('Found empty id value');
    });

    it('rejects duplicate ids', () => {
        const text = tsv([
            ['id', 'files.raw'],
            ['e1', 'a.txt'],
            ['e1', 'b.txt'],
        ]);
        expect(errorOf(text)).toContain('Found duplicate ids within metadata file: e1');
    });

    it('rejects duplicate file names within one entry', () => {
        const text = tsv([
            ['id', 'files.raw'],
            ['e1', 'a.txt::one/a.txt a.txt::two/a.txt'],
        ]);
        expect(errorOf(text)).toContain('Found duplicate file names for entry e1 in the raw category: a.txt');
    });

    it('allows two different names to share the same explicit path', () => {
        const text = tsv([
            ['id', 'files.raw'],
            ['e1', 'a.txt::x b.txt::x'],
        ]);
        expect(entriesOf(text, 'e1', 'raw')).toEqual([declaredFile('a.txt', 'x'), declaredFile('b.txt', 'x')]);
    });

    it('omits the category entirely for an empty cell', () => {
        const text = tsv([
            ['id', 'files.raw', 'files.processed'],
            ['e1', 'a.txt', ''],
        ]);
        const result = parseSubmissionFileMapping(text, knownCategories)._unsafeUnwrap();
        expect([...result.get('e1')!.keys()]).toEqual(['raw']);
    });

    it('parses several categories across several entries', () => {
        const text = tsv([
            ['id', 'country', 'files.raw', 'files.processed'],
            ['e1', 'CH', 'a.txt', 'a.json'],
            ['e2', 'DE', 'b.txt', 'b.json'],
        ]);
        const result = parseSubmissionFileMapping(text, knownCategories)._unsafeUnwrap();
        expect([...result.keys()]).toEqual(['e1', 'e2']);
        expect(entriesOf(text, 'e1', 'processed').map((f) => f.name)).toEqual(['a.json']);
        expect(entriesOf(text, 'e2', 'raw').map((f) => f.name)).toEqual(['b.txt']);
    });
});

describe('resolveFileMappings', () => {
    const metadataEntry = declaredFile('a.txt');
    const metadataEntryWithFileId = reusedFile('a.txt', 'existing-id');
    const uploadEntry = uploadedFile('a.txt', 'uploaded-id');
    const linkedEntry = linkedFile('a.txt', 'a.txt', 'uploaded-id');
    const emptyDetails = { linked: [], reused: [], missing: [], orphaned: [], shadowed: [] };

    describe('linked', () => {
        it('when a metadata entry and an upload folder entry share a path', () => {
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { raw: [metadataEntry] } }),
                fileMappingOf({ raw: [uploadEntry] }),
            );
            expect(fileLinkage.get('raw')).toEqual({ ...emptyDetails, linked: [linkedEntry] });
            expect(submissionFileMapping.get('e1')!.get('raw')!.get('a.txt')!.fileId).toBe('uploaded-id');
        });

        it('when several metadata entries reference the same upload folder entry', () => {
            const { fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { raw: [metadataEntry] }, e2: { raw: [metadataEntry] } }),
                fileMappingOf({ raw: [uploadEntry] }),
            );
            // Every metadata entry claiming the upload is listed, so the upload appears once per entry
            expect(fileLinkage.get('raw')).toEqual({ ...emptyDetails, linked: [linkedEntry, linkedEntry] });
        });

        it('when one metadata entry on the path has its own file ID and another does not', () => {
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { raw: [metadataEntryWithFileId] }, e2: { raw: [metadataEntry] } }),
                fileMappingOf({ raw: [uploadEntry] }),
            );
            expect(fileLinkage.get('raw')).toEqual({
                ...emptyDetails,
                linked: [linkedEntry],
                reused: [metadataEntryWithFileId],
            });
            expect(submissionFileMapping.get('e1')!.get('raw')!.get('a.txt')!.fileId).toBe('existing-id');
            expect(submissionFileMapping.get('e2')!.get('raw')!.get('a.txt')!.fileId).toBe('uploaded-id');
        });
    });

    describe('reused', () => {
        it('when a metadata entry has its own file ID and nothing was uploaded', () => {
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { raw: [metadataEntryWithFileId] } }),
                fileMappingOf({}),
            );
            expect(fileLinkage.get('raw')).toEqual({ ...emptyDetails, reused: [metadataEntryWithFileId] });
            expect(submissionFileMapping.get('e1')!.get('raw')!.get('a.txt')!.fileId).toBe('existing-id');
            expect(getLinkageErrors(fileLinkage)).toBeUndefined();
        });
    });

    describe('missing', () => {
        it('when a metadata entry has no file ID and no upload folder entry on its path', () => {
            const otherUpload = uploadedFile('b.txt', 'uploaded-b');
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { raw: [metadataEntry] } }),
                fileMappingOf({ raw: [otherUpload] }),
            );
            expect(fileLinkage.get('raw')).toEqual({
                ...emptyDetails,
                missing: [metadataEntry],
                orphaned: [otherUpload],
            });
            expect(submissionFileMapping.size).toBe(0);
        });
    });

    describe('orphaned', () => {
        it('when an upload folder entry has no metadata entry on its path', () => {
            const { fileLinkage } = resolveFileMappings(new Map(), fileMappingOf({ raw: [uploadEntry] }));
            expect(fileLinkage.get('raw')).toEqual({ ...emptyDetails, orphaned: [uploadEntry] });
        });
    });

    describe('shadowed', () => {
        it('when every metadata entry on the path has its own file ID, so none of them claim the upload', () => {
            const { submissionFileMapping, fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { raw: [metadataEntryWithFileId] } }),
                fileMappingOf({ raw: [uploadEntry] }),
            );
            expect(fileLinkage.get('raw')).toEqual({
                ...emptyDetails,
                reused: [metadataEntryWithFileId],
                shadowed: [uploadEntry],
            });
            expect(submissionFileMapping.get('e1')!.get('raw')!.get('a.txt')!.fileId).toBe('existing-id');
        });
    });

    describe('file categories', () => {
        it('are covered when present on only one side', () => {
            const jsonEntry = declaredFile('a.json');
            const { fileLinkage } = resolveFileMappings(
                submissionMappingOf({ e1: { processed: [jsonEntry] } }),
                fileMappingOf({ raw: [uploadEntry] }),
            );
            expect([...fileLinkage.keys()].sort()).toEqual(['processed', 'raw']);
            expect(fileLinkage.get('processed')).toEqual({ ...emptyDetails, missing: [jsonEntry] });
            expect(fileLinkage.get('raw')).toEqual({ ...emptyDetails, orphaned: [uploadEntry] });
        });
    });
});

describe('getLinkageErrors', () => {
    const file = (path: string) => declaredFile(path);
    const upload = (path: string) => uploadedFile(path, `id-${path}`);
    const detailsOf = (missing: string[], orphaned: string[]): FileLinkage =>
        new Map([
            [
                'raw',
                { linked: [], reused: [], missing: missing.map(file), orphaned: orphaned.map(upload), shadowed: [] },
            ],
        ]);

    it('returns undefined when nothing is missing or orphaned', () => {
        expect(getLinkageErrors(detailsOf([], []))).toBeUndefined();
    });

    it('reports missing files', () => {
        expect(getLinkageErrors(detailsOf(['a.txt'], []))).toBe(
            getLinkageErrorMessage(LinkageType.MISSING, 'raw', 'a.txt'),
        );
    });

    it('reports orphaned files', () => {
        expect(getLinkageErrors(detailsOf([], ['b.txt']))).toBe(
            getLinkageErrorMessage(LinkageType.ORPHANED, 'raw', 'b.txt'),
        );
    });

    it('reports shadowed uploads separately from genuinely unreferenced ones', () => {
        const fileLinkage: FileLinkage = new Map([
            [
                'raw',
                {
                    linked: [],
                    reused: [reusedFile('a.txt', 'id-a.txt')],
                    missing: [],
                    orphaned: [upload('stray.txt')],
                    shadowed: [upload('a.txt')],
                },
            ],
        ]);
        expect(getLinkageErrors(fileLinkage)).toBe(
            `${getLinkageErrorMessage(LinkageType.ORPHANED, 'raw', 'stray.txt')} ${getLinkageErrorMessage(LinkageType.SHADOWED, 'raw', 'a.txt')}`,
        );
    });

    it('ignores linked and reused files', () => {
        const fileLinkage: FileLinkage = new Map([
            [
                'raw',
                {
                    linked: [linkedFile('a.txt', 'a.txt', 'id-a.txt')],
                    reused: [reusedFile('b.txt', 'id-b.txt')],
                    missing: [],
                    orphaned: [],
                    shadowed: [],
                },
            ],
        ]);
        expect(getLinkageErrors(fileLinkage)).toBeUndefined();
    });

    it('joins problems across categories', () => {
        const fileLinkage: FileLinkage = new Map([
            ['raw', { linked: [], reused: [], missing: [file('a.txt')], orphaned: [], shadowed: [] }],
            ['processed', { linked: [], reused: [], missing: [], orphaned: [upload('b.json')], shadowed: [] }],
        ]);
        expect(getLinkageErrors(fileLinkage)).toBe(
            `${getLinkageErrorMessage(LinkageType.MISSING, 'raw', 'a.txt')} ${getLinkageErrorMessage(LinkageType.ORPHANED, 'processed', 'b.json')}`,
        );
    });
});

describe('applyFileMappings', () => {
    const metadataFile = (rows: string[][]) => new File([tsv(rows)], 'metadata.tsv');
    const linesOf = async (file: File) => (await file.text()).split('\n');

    it('writes name:fileId into an existing file column', async () => {
        const merged = resolvedMappingOf({ e1: { raw: [{ name: 'a.txt', fileId: 'id-a' }] } });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'files.raw'],
                ['e1', 'a.txt'],
            ]),
            merged,
        );
        expect(await linesOf(result._unsafeUnwrap())).toEqual(['id\tfiles.raw', 'e1\ta.txt:id-a']);
    });

    it('joins several files in one cell', async () => {
        const merged = resolvedMappingOf({
            e1: {
                raw: [
                    { name: 'a.txt', fileId: 'id-a' },
                    { name: 'b.txt', fileId: 'id-b' },
                ],
            },
        });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'files.raw'],
                ['e1', ''],
            ]),
            merged,
        );
        expect(await linesOf(result._unsafeUnwrap())).toEqual(['id\tfiles.raw', 'e1\ta.txt:id-a b.txt:id-b']);
    });

    it('appends a column for a category missing from the header', async () => {
        const merged = resolvedMappingOf({ e1: { raw: [{ name: 'a.txt', fileId: 'id-a' }] } });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'country'],
                ['e1', 'CH'],
            ]),
            merged,
        );
        expect(await linesOf(result._unsafeUnwrap())).toEqual(['id\tcountry\tfiles.raw', 'e1\tCH\ta.txt:id-a']);
    });

    it('leaves rows with no files for the category untouched', async () => {
        const merged = resolvedMappingOf({ e1: { raw: [{ name: 'a.txt', fileId: 'id-a' }] } });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'files.raw'],
                ['e1', ''],
                ['e2', 'keep-me'],
            ]),
            merged,
        );
        expect(await linesOf(result._unsafeUnwrap())).toEqual(['id\tfiles.raw', 'e1\ta.txt:id-a', 'e2\tkeep-me']);
    });

    it('keeps rows aligned when appending a column that only some entries use', async () => {
        const merged = resolvedMappingOf({ e1: { raw: [{ name: 'a.txt', fileId: 'id-a' }] } });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'country'],
                ['e1', 'CH'],
                ['e2', 'DE'],
            ]),
            merged,
        );
        expect(await linesOf(result._unsafeUnwrap())).toEqual([
            'id\tcountry\tfiles.raw',
            'e1\tCH\ta.txt:id-a',
            'e2\tDE\t',
        ]);
    });
});
