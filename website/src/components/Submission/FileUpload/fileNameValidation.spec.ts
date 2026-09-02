import { describe, expect, it } from 'vitest';

import { validateFileNames, getFileNameErrorString } from './fileNameValidation';

const strict = { disableStrictFilenameValidation: false };
const notStrict = { disableStrictFilenameValidation: true };

describe('validateFileNames without strict validation', () => {
    const errorsOf = (fileName: string) => validateFileNames([fileName], notStrict)._unsafeUnwrapErr();

    it('accepts a submission without any files', () => {
        expect(validateFileNames([], notStrict).isOk()).toBeTruthy();
    });

    it.each(['file.txt', 'my_file.fasta', 'data-2024.csv', 'file123.json', 'UPPERCASE.TXT'])(
        'accepts %s',
        (fileName) => {
            expect(validateFileNames([fileName], notStrict).isOk()).toBeTruthy();
        },
    );

    it.each(['文件.txt', 'データ.csv', 'файл.json', 'αρχείο.xml', 'ملف.fasta'])(
        'accepts the unicode file name %s',
        (fileName) => {
            expect(validateFileNames([fileName], notStrict).isOk()).toBeTruthy();
        },
    );

    it.each(['.gitignore', '.hidden_file.txt'])('accepts the leading period in %s', (fileName) => {
        expect(validateFileNames([fileName], notStrict).isOk()).toBeTruthy();
    });

    it.each(['CONFIG.txt', 'COM10.txt', 'NULL.txt', 'AUXILIARY.fasta', 'my_CON.txt', '.CON'])(
        'accepts %s, which merely resembles a reserved device name',
        (fileName) => {
            expect(validateFileNames([fileName], notStrict).isOk()).toBeTruthy();
        },
    );

    it('rejects an empty file name', () => {
        expect(errorsOf('')[0].message).toContain('cannot be empty');
    });

    it.each([
        'file<test.txt',
        'file>test.txt',
        'file:test.txt',
        'file"test.txt',
        'file/test.txt',
        'file\\test.txt',
        'file|test.txt',
        'file?.txt',
        'file*.txt',
        'file;test.txt',
        '50%.fastq',
        'file#1.txt',
    ])('rejects the forbidden character in %s', (fileName) => {
        expect(errorsOf(fileName)[0].message).toContain('cannot contain any of the following characters');
    });

    it('rejects a file name containing NUL', () => {
        expect(errorsOf('file\u0000test.txt')[0].message).toContain('cannot contain ASCII control characters');
    });

    it('rejects a file name containing an ASCII control character', () => {
        expect(errorsOf('file\u0001test.txt')[0].message).toContain('cannot contain ASCII control characters');
    });

    it.each(['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM9', 'LPT1', 'LPT9', 'con', 'Nul', 'CON.txt', 'nul.tar.gz'])(
        'rejects the reserved device name %s',
        (fileName) => {
            expect(errorsOf(fileName)[0].message).toContain('cannot be Windows reserved device names');
        },
    );

    it.each(['.', '..', '...', 'reads.fastq.'])('rejects the trailing period in %s', (fileName) => {
        expect(errorsOf(fileName)[0].message).toContain('cannot end with a period');
    });

    it('rejects a file name containing whitespace', () => {
        expect(errorsOf('file test.txt')[0].message).toContain('cannot contain whitespace');
    });

    it('rejects a file name exceeding 255 characters', () => {
        expect(errorsOf('a'.repeat(256) + '.txt')[0].message).toContain('may not exceed 255 characters');
    });

    it('rejects a file name exceeding 255 bytes but not 255 characters', () => {
        const fileName = '文'.repeat(100) + '.txt';

        expect(fileName.length).toBeLessThan(256);
        expect(errorsOf(fileName)[0].message).toContain('may not exceed 255 bytes');
    });

    it('names the offending file in the error', () => {
        expect(errorsOf('my reads.fastq')[0].message).toContain("'my reads.fastq'");
    });

    it('reports one error per invalid file name', () => {
        expect(
            validateFileNames(['valid.txt', 'my reads.fastq', 'CON.txt'], notStrict)._unsafeUnwrapErr(),
        ).toHaveLength(2);
    });

    it('reports only the first violation of a file name breaking several restrictions', () => {
        const errors = errorsOf('CON.');

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('cannot be Windows reserved device names');
    });
});

describe('validateFileNames with strict validation', () => {
    const errorsOf = (fileName: string) => validateFileNames([fileName], strict)._unsafeUnwrapErr();

    it.each(['file.txt', 'my_file.fasta', 'data-2024.csv', 'file123.json', 'UPPERCASE.TXT', '.gitignore'])(
        'accepts %s',
        (fileName) => {
            expect(validateFileNames([fileName], strict).isOk()).toBeTruthy();
        },
    );

    it.each(['文件.txt', 'データ.csv', 'файл.json', 'αρχείο.xml', 'ملف.fasta'])(
        'rejects the unicode file name %s',
        (fileName) => {
            expect(errorsOf(fileName)[0].message).toContain('must only contain alphanumeric characters');
        },
    );

    it.each([
        'file&name.txt',
        'file$name.txt',
        "file'name.txt",
        'file(1).txt',
        'file+name.txt',
        'file,name.txt',
        'file=name.txt',
        'file@name.txt',
        'file~name.txt',
        'file!name.txt',
        'file[1].txt',
        'file{1}.txt',
    ])('rejects %s, whose characters are outside the allowlist', (fileName) => {
        expect(errorsOf(fileName)[0].message).toContain('must only contain alphanumeric characters');
    });

    it.each(['CON.txt', 'NUL', '.', '..'])('still applies the base restrictions to %s', (fileName) => {
        expect(validateFileNames([fileName], strict).isErr()).toBeTruthy();
    });
});

describe('getFileNameErrorString', () => {
    const errors = (count: number) => Array.from({ length: count }, (_, i) => new Error(`error ${i}`));

    it('lists every error when they fit within the count', () => {
        expect(getFileNameErrorString(errors(3), 10)).toBe('error 0, error 1, error 2');
    });

    it('lists the first errors up to the count and summarises the rest', () => {
        expect(getFileNameErrorString(errors(12), 10)).toBe(
            'error 0, error 1, error 2, error 3, error 4, error 5, error 6, error 7, error 8, error 9, ... and 2 more',
        );
    });
});
