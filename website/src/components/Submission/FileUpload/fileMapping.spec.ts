import { describe, expect, it } from 'vitest';

import {
    applyFileMappings,
    getFileLinkage,
    getLinkageErrors,
    parseSubmissionFileMapping,
    type FileMapping,
    type ResolvedSubmissionFile,
    type SubmissionFile,
    type SubmissionFileMapping,
} from './fileMapping';

const tsv = (rows: string[][]) => rows.map((row) => row.join('\t')).join('\n');

const entriesOf = (text: string, submissionId: string, category: string): SubmissionFile[] => {
    const result = parseSubmissionFileMapping(text);
    if (result.isErr()) throw new Error(`expected a successful parse, got: ${result.error.message}`);
    return [...(result.value.get(submissionId)?.get(category)?.values() ?? [])];
};

const errorOf = (text: string): string => {
    const result = parseSubmissionFileMapping(text);
    if (result.isOk()) throw new Error('expected the parse to fail');
    return result.error.message;
};

const fileMappingOf = <T extends SubmissionFile>(categories: Record<string, T[]>): FileMapping<T> =>
    new Map(Object.entries(categories).map(([category, files]) => [category, new Map(files.map((f) => [f.path, f]))]));

const submissionMappingOf = (submissions: Record<string, Record<string, SubmissionFile[]>>): SubmissionFileMapping =>
    new Map(Object.entries(submissions).map(([submissionId, categories]) => [submissionId, fileMappingOf(categories)]));

describe('parseSubmissionFileMapping', () => {
    it('parses every accepted file entry form', () => {
        const text = tsv([
            ['id', 'files.raw'],
            ['e1', 'a.txt b.txt::sub/b.txt c.txt::sub/c.txt:id-c d.txt:id-d'],
        ]);
        expect(entriesOf(text, 'e1', 'raw')).toEqual([
            { name: 'a.txt', path: 'a.txt', fileId: undefined },
            { name: 'b.txt', path: 'sub/b.txt', fileId: undefined },
            { name: 'c.txt', path: 'sub/c.txt', fileId: 'id-c' },
            { name: 'd.txt', path: 'd.txt', fileId: 'id-d' },
        ]);
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
        );
        expect(result._unsafeUnwrap()).toEqual(new Map());
        expect(parseSubmissionFileMapping(tsv([['country'], ['CH']]))._unsafeUnwrap()).toEqual(new Map());
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

    it('rejects duplicate file paths within one entry', () => {
        const text = tsv([
            ['id', 'files.raw'],
            ['e1', 'a.txt::x b.txt::x'],
        ]);
        expect(errorOf(text)).toContain('Found duplicate file paths for entry e1 in the raw category: x');
    });

    it('omits the category entirely for an empty cell', () => {
        const text = tsv([
            ['id', 'files.raw', 'files.processed'],
            ['e1', 'a.txt', ''],
        ]);
        const result = parseSubmissionFileMapping(text)._unsafeUnwrap();
        expect([...result.get('e1')!.keys()]).toEqual(['raw']);
    });

    it('parses several categories across several entries', () => {
        const text = tsv([
            ['id', 'country', 'files.raw', 'files.processed'],
            ['e1', 'CH', 'a.txt', 'a.json'],
            ['e2', 'DE', 'b.txt', 'b.json'],
        ]);
        const result = parseSubmissionFileMapping(text)._unsafeUnwrap();
        expect([...result.keys()]).toEqual(['e1', 'e2']);
        expect(entriesOf(text, 'e1', 'processed').map((f) => f.name)).toEqual(['a.json']);
        expect(entriesOf(text, 'e2', 'raw').map((f) => f.name)).toEqual(['b.txt']);
    });
});

describe('getFileLinkage', () => {
    const metadataEntry: SubmissionFile = { name: 'a.txt', path: 'a.txt' };
    const metadataEntryWithFileId: SubmissionFile = { name: 'a.txt', path: 'a.txt', fileId: 'existing-id' };
    const uploadFolderEntry: ResolvedSubmissionFile = { name: 'a.txt', path: 'a.txt', fileId: 'uploaded-id' };
    const emptyDetails = { linked: [], reused: [], missing: [], orphaned: [], shadowed: [] };

    describe('linked', () => {
        it('when a metadata entry and an upload folder entry share a path', () => {
            const { submissionFileMapping, details } = getFileLinkage(
                submissionMappingOf({ e1: { raw: [metadataEntry] } }),
                fileMappingOf({ raw: [uploadFolderEntry] }),
            );
            expect(details.get('raw')).toEqual({ ...emptyDetails, linked: [uploadFolderEntry] });
            expect(submissionFileMapping.get('e1')!.get('raw')!.get('a.txt')!.fileId).toBe('uploaded-id');
        });

        it('when several metadata entries reference the same upload folder entry', () => {
            const { details } = getFileLinkage(
                submissionMappingOf({ e1: { raw: [metadataEntry] }, e2: { raw: [metadataEntry] } }),
                fileMappingOf({ raw: [uploadFolderEntry] }),
            );
            expect(details.get('raw')).toEqual({ ...emptyDetails, linked: [uploadFolderEntry] });
        });

        it('when one metadata entry on the path has its own file ID and another does not', () => {
            const { submissionFileMapping, details } = getFileLinkage(
                submissionMappingOf({ e1: { raw: [metadataEntryWithFileId] }, e2: { raw: [metadataEntry] } }),
                fileMappingOf({ raw: [uploadFolderEntry] }),
            );
            expect(details.get('raw')).toEqual({
                ...emptyDetails,
                linked: [uploadFolderEntry],
                reused: [metadataEntryWithFileId],
            });
            expect(submissionFileMapping.get('e1')!.get('raw')!.get('a.txt')!.fileId).toBe('existing-id');
            expect(submissionFileMapping.get('e2')!.get('raw')!.get('a.txt')!.fileId).toBe('uploaded-id');
        });
    });

    describe('reused', () => {
        it('when a metadata entry has its own file ID and nothing was uploaded', () => {
            const { submissionFileMapping, details } = getFileLinkage(
                submissionMappingOf({ e1: { raw: [metadataEntryWithFileId] } }),
                fileMappingOf({}),
            );
            expect(details.get('raw')).toEqual({ ...emptyDetails, reused: [metadataEntryWithFileId] });
            expect(submissionFileMapping.get('e1')!.get('raw')!.get('a.txt')!.fileId).toBe('existing-id');
            expect(getLinkageErrors(details)).toBeUndefined();
        });
    });

    describe('missing', () => {
        it('when a metadata entry has no file ID and no upload folder entry on its path', () => {
            const otherUpload: ResolvedSubmissionFile = { name: 'b.txt', path: 'b.txt', fileId: 'uploaded-b' };
            const { submissionFileMapping, details } = getFileLinkage(
                submissionMappingOf({ e1: { raw: [metadataEntry] } }),
                fileMappingOf({ raw: [otherUpload] }),
            );
            expect(details.get('raw')).toEqual({
                ...emptyDetails,
                missing: [metadataEntry],
                orphaned: [otherUpload],
            });
            expect(submissionFileMapping.size).toBe(0);
        });
    });

    describe('orphaned', () => {
        it('when an upload folder entry has no metadata entry on its path', () => {
            const { details } = getFileLinkage(new Map(), fileMappingOf({ raw: [uploadFolderEntry] }));
            expect(details.get('raw')).toEqual({ ...emptyDetails, orphaned: [uploadFolderEntry] });
        });
    });

    describe('shadowed', () => {
        it('when every metadata entry on the path has its own file ID', () => {
            const { submissionFileMapping, details } = getFileLinkage(
                submissionMappingOf({ e1: { raw: [metadataEntryWithFileId] } }),
                fileMappingOf({ raw: [uploadFolderEntry] }),
            );
            expect(details.get('raw')).toEqual({
                ...emptyDetails,
                reused: [metadataEntryWithFileId],
                shadowed: [uploadFolderEntry],
            });
            expect(submissionFileMapping.get('e1')!.get('raw')!.get('a.txt')!.fileId).toBe('existing-id');
        });
    });

    describe('file categories', () => {
        it('are covered when present on only one side', () => {
            const jsonEntry: SubmissionFile = { name: 'a.json', path: 'a.json' };
            const { details } = getFileLinkage(
                submissionMappingOf({ e1: { processed: [jsonEntry] } }),
                fileMappingOf({ raw: [uploadFolderEntry] }),
            );
            expect([...details.keys()].sort()).toEqual(['processed', 'raw']);
            expect(details.get('processed')).toEqual({ ...emptyDetails, missing: [jsonEntry] });
            expect(details.get('raw')).toEqual({ ...emptyDetails, orphaned: [uploadFolderEntry] });
        });
    });
});

describe('getLinkageErrors', () => {
    const file = (path: string): SubmissionFile => ({ name: path, path });
    const detailsOf = (missing: string[], orphaned: string[]) =>
        new Map([
            ['raw', { linked: [], reused: [], missing: missing.map(file), orphaned: orphaned.map(file), shadowed: [] }],
        ]);

    it('returns undefined when nothing is missing or orphaned', () => {
        expect(getLinkageErrors(detailsOf([], []))).toBeUndefined();
    });

    it('reports missing files', () => {
        expect(getLinkageErrors(detailsOf(['a.txt'], []))).toBe(
            'The following raw files were referenced in metadata but not uploaded: a.txt.',
        );
    });

    it('reports orphaned files', () => {
        expect(getLinkageErrors(detailsOf([], ['b.txt']))).toBe(
            'The following raw files were uploaded but not referenced in metadata: b.txt.',
        );
    });

    it('reports shadowed uploads separately from genuinely unreferenced ones', () => {
        const details = new Map([
            [
                'raw',
                {
                    linked: [],
                    reused: [file('a.txt')],
                    missing: [],
                    orphaned: [file('stray.txt')],
                    shadowed: [file('a.txt')],
                },
            ],
        ]);
        expect(getLinkageErrors(details)).toBe(
            'The following raw files were uploaded but not referenced in metadata: stray.txt. ' +
                'The following raw files were uploaded but the metadata still references an existing file for them: a.txt. ' +
                'Remove the file ID from the metadata entry to replace it.',
        );
    });

    it('joins problems across categories', () => {
        const details = new Map([
            ['raw', { linked: [], reused: [], missing: [file('a.txt')], orphaned: [], shadowed: [] }],
            ['processed', { linked: [], reused: [], missing: [], orphaned: [file('b.json')], shadowed: [] }],
        ]);
        expect(getLinkageErrors(details)).toBe(
            'The following raw files were referenced in metadata but not uploaded: a.txt. ' +
                'The following processed files were uploaded but not referenced in metadata: b.json.',
        );
    });
});

describe('applyFileMappings', () => {
    const metadataFile = (rows: string[][]) => new File([tsv(rows)], 'metadata.tsv');
    const linesOf = async (file: File) => (await file.text()).split('\n');

    it('writes name:fileId into an existing file column', async () => {
        const merged = submissionMappingOf({
            e1: { raw: [{ name: 'a.txt', path: 'a.txt', fileId: 'id-a' }] },
        });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'files.raw'],
                ['e1', 'a.txt'],
            ]),
            merged,
        );
        expect(await linesOf(result)).toEqual(['id\tfiles.raw', 'e1\ta.txt:id-a']);
    });

    it('joins several files in one cell', async () => {
        const merged = submissionMappingOf({
            e1: {
                raw: [
                    { name: 'a.txt', path: 'a.txt', fileId: 'id-a' },
                    { name: 'b.txt', path: 'sub/b.txt', fileId: 'id-b' },
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
        expect(await linesOf(result)).toEqual(['id\tfiles.raw', 'e1\ta.txt:id-a b.txt:id-b']);
    });

    it('appends a column for a category missing from the header', async () => {
        const merged = submissionMappingOf({
            e1: { raw: [{ name: 'a.txt', path: 'a.txt', fileId: 'id-a' }] },
        });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'country'],
                ['e1', 'CH'],
            ]),
            merged,
        );
        expect(await linesOf(result)).toEqual(['id\tcountry\tfiles.raw', 'e1\tCH\ta.txt:id-a']);
    });

    it('leaves rows with no files for the category untouched', async () => {
        const merged = submissionMappingOf({
            e1: { raw: [{ name: 'a.txt', path: 'a.txt', fileId: 'id-a' }] },
        });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'files.raw'],
                ['e1', ''],
                ['e2', 'keep-me'],
            ]),
            merged,
        );
        expect(await linesOf(result)).toEqual(['id\tfiles.raw', 'e1\ta.txt:id-a', 'e2\tkeep-me']);
    });

    it('keeps rows aligned when appending a column that only some entries use', async () => {
        const merged = submissionMappingOf({
            e1: { raw: [{ name: 'a.txt', path: 'a.txt', fileId: 'id-a' }] },
        });
        const result = await applyFileMappings(
            metadataFile([
                ['id', 'country'],
                ['e1', 'CH'],
                ['e2', 'DE'],
            ]),
            merged,
        );
        expect(await linesOf(result)).toEqual(['id\tcountry\tfiles.raw', 'e1\tCH\ta.txt:id-a', 'e2\tDE\t']);
    });

    it('returns the original file when there are no rows', async () => {
        const empty = metadataFile([]);
        expect(await applyFileMappings(empty, new Map())).toBe(empty);
    });
});
