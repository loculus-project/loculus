import { describe, expect, it } from 'vitest';

import { validateFileNames, getFileNameErrorMessage } from './fileNameValidation';

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
        expect(errorsOf('')[0].message).toContain('may not be empty');
    });

    it.each(['<', '>', ':', '"', '/', '\\', '|', '?', '*', ';', '%', '#'])(
        'rejects the forbidden character %s',
        (character) => {
            expect(errorsOf(`file${character}test.txt`)[0].message).toContain(
                'may not contain forbidden characters',
            );
        },
    );

    it('rejects a file name containing NUL', () => {
        expect(errorsOf('file\u0000test.txt')[0].message).toContain('may not contain ASCII control characters');
    });

    it('rejects a file name containing an ASCII control character', () => {
        expect(errorsOf('file\u0001test.txt')[0].message).toContain('may not contain ASCII control characters');
    });

    it.each(['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM9', 'LPT1', 'LPT9', 'con', 'Nul', 'CON.txt', 'nul.tar.gz'])(
        'rejects the reserved device name %s',
        (fileName) => {
            expect(errorsOf(fileName)[0].message).toContain('may not use Windows reserved device names');
        },
    );

    it.each(['.', '..', '...', 'reads.fastq.'])('rejects the trailing period in %s', (fileName) => {
        expect(errorsOf(fileName)[0].message).toContain('may not end with a period');
    });

    it('rejects a file name containing whitespace', () => {
        expect(errorsOf('file test.txt')[0].message).toContain('may not contain whitespace');
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
        expect(errors[0].message).toContain('may not use Windows reserved device names');
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

    it.each(['&', '$', "'", '(', ')', '+', ',', '=', '@', '~', '!', '[', ']', '{', '}'])(
        'rejects %s, which is outside the allowlist',
        (character) => {
            expect(errorsOf(`file${character}name.txt`)[0].message).toContain(
                'must only contain alphanumeric characters',
            );
        },
    );

    it.each(['CON.txt', 'NUL', '.', '..'])('still applies the base restrictions to %s', (fileName) => {
        expect(validateFileNames([fileName], strict).isErr()).toBeTruthy();
    });
});

describe('getFileNameErrorMessage', () => {
    const errors = (count: number) => Array.from({ length: count }, (_, i) => new Error(`error ${i}`));

    it('lists every error when they fit within the count', () => {
        expect(getFileNameErrorMessage(errors(3), 5)).not.toContain('more');
    });

    it('summarises the errors beyond the count', () => {
        expect(getFileNameErrorMessage(errors(7), 5)).toContain('2 more');
    });
});
