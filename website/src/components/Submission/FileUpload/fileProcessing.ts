import * as XLSX from '@lokalise/xlsx';
import * as fflate from 'fflate';
import * as fzstd from 'fzstd';
import JSZip from 'jszip';
import { Result, ok, err } from 'neverthrow';
import { type SVGProps, type ForwardRefExoticComponent } from 'react';

import MaterialSymbolsLightDataTableOutline from '~icons/material-symbols-light/data-table-outline';
import PhDnaLight from '~icons/ph/dna-light';

type Icon = ForwardRefExoticComponent<SVGProps<SVGSVGElement>>;

export type FileKind = {
    type: 'metadata' | 'fasta' | 'singleSegment';
    icon: Icon;
    supportedExtensions: string[];
    processRawFile: (file: File) => Promise<Result<ProcessedFile, Error>>;
};

const COMPRESSION_EXTENSIONS = ['zst', 'gz', 'zip', 'xz'];

export const METADATA_FILE_KIND: FileKind = {
    type: 'metadata',
    icon: MaterialSymbolsLightDataTableOutline,
    supportedExtensions: ['tsv', 'xlsx', 'xls'],
    processRawFile: async (file: File) => {
        const fileNameParts = file.name.toLowerCase().split('.');
        const extension = fileNameParts[fileNameParts.length - 1];
        const isCompressed = COMPRESSION_EXTENSIONS.includes(extension);
        const dataExtension = isCompressed ? fileNameParts[fileNameParts.length - 2] : extension;
        const compressionExtension = isCompressed ? extension : null;
        if (dataExtension === 'tsv' && !isCompressed) return ok(new RawFile(file));
        if (dataExtension === 'tsv' && isCompressed) return ok(new CompressedFile(file));
        if (dataExtension === 'xlsx' || dataExtension === 'xls') {
            if (isCompressed && compressionExtension === 'xz') {
                return err(
                    new Error(
                        'LZMA compression (.xz files) is not supported with Excel files yet. ' +
                        'Please use a different compression format for Excel files.',
                    ),
                );
            }
            const compression = isCompressed ? (compressionExtension as SupportedInBrowserCompressionKind) : null;
            const excelFile = new ExcelFile(file, compression);
            try {
                await excelFile.init();
            } catch (error) {
                return err(error as Error);
            }
            return ok(excelFile);
        }
        return err(
            new Error(
                `Unsupported file extension for metadata upload. Please use one of: ${METADATA_FILE_KIND.supportedExtensions.join(
                    ', ',
                )}.`,
            ),
        );
    },
};

export const FASTA_FILE_KIND: FileKind = {
    type: 'fasta',
    icon: PhDnaLight,
    supportedExtensions: ['fasta'],
    processRawFile: (file) => Promise.resolve(ok(new RawFile(file))),
};

/**
 * For files that contain only a single segment.
 * Can have a FASTA header, but it will be ignored.
 * Can be multiple lines, the lines will be concatenated, and whitespace stripped on both ends.
 * Compression not supported.
 */
export const PLAIN_SEGMENT_KIND: FileKind = {
    type: 'singleSegment',
    icon: PhDnaLight,
    supportedExtensions: ['sequence'],
    processRawFile: async (file: File) => {
        const text = await file.text();
        const lines = text.split('\n');
        const firstUntrimmedLine = lines.findIndex((l) => l.trim() !== l);
        if (firstUntrimmedLine >= 0) {
            return err(
                new Error(
                    `Line ${firstUntrimmedLine + 1} contains leading or trailing whitespace, which is not allowed.`,
                ),
            );
        }

        const headerLines = lines.filter((l) => l.startsWith('>'));
        if (headerLines.length > 1) {
            return err(
                new Error(`Found ${headerLines.length} headers in uploaded file, only a single header is allowed.`),
            );
        }
        const header = headerLines.length === 1
            ? headerLines[0].substring(1).trim()
            : null;
        const segmentData = lines
            .filter((l) => !l.startsWith('>'))
            .map((l) => l.trim())
            .join('');
        if (segmentData.length === 0) {
            return err(new Error('Uploaded file does not appear to contain any sequence data.'));
        }
        return ok({
            inner: () => {
                const blob = new Blob([segmentData], { type: 'text/plain' });
                return new File([blob], 'segment.txt', { type: 'text/plain' });
            },
            text: () => Promise.resolve(segmentData),
            handle: () => file,
            warnings: () => [],
            header: () => Promise.resolve(header),
        });
    },
};

export interface ProcessedFile {
    /* The file containing the data (might be processed, only exists in memory) */
    inner(): File;

    text(): Promise<string>;

    header(): Promise<string | null>;

    /* The handle to the file on disk. */
    handle(): File;

    /* Warnings that came up during file processing. */
    warnings(): string[];
}

export const dummy = 0;

export class RawFile implements ProcessedFile {
    constructor(private innerFile: File) { }

    inner(): File {
        return this.innerFile;
    }

    handle(): File {
        return this.innerFile;
    }

    async text(): Promise<string> {
        return this.innerFile.text();
    }

    header(): Promise<string | null> {
        return Promise.resolve(null);
    }

    warnings(): string[] {
        return [];
    }
}

export class VirtualFile extends RawFile {
    constructor(content: string, fileName: string = 'virtual.txt') {
        const blob = new Blob([content]);
        super(new File([blob], fileName));
    }
}

type SupportedInBrowserCompressionKind = 'zst' | 'gz' | 'zip';
const isSupportedInBrowserCompressionKind = (s: string): s is SupportedInBrowserCompressionKind =>
    ['zst', 'gz', 'zip'].includes(s);

async function decompress(
    compressedData: ArrayBuffer,
    compression: SupportedInBrowserCompressionKind,
): Promise<ArrayBufferLike> {
    switch (compression) {
        case 'zst': {
            const array = fzstd.decompress(new Uint8Array(compressedData));
            return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
        }
        case 'gz': {
            return fflate.decompressSync(new Uint8Array(compressedData)).buffer;
        }
        case 'zip': {
            const zip = JSZip.loadAsync(compressedData);
            return zip.then((z) => z.files[Object.keys(z.files)[0]].async('arraybuffer'));
        }
    }
}

export class CompressedFile extends RawFile {
    async text(): Promise<string> {
        const fileNameSegments = this.inner().name.split('.');
        const compressionType = fileNameSegments[fileNameSegments.length - 1].toLowerCase();

        if (isSupportedInBrowserCompressionKind(compressionType)) {
            return this.inner()
                .arrayBuffer()
                .then((b) => decompress(b, compressionType))
                .then((b) => new TextDecoder('utf-8').decode(b as ArrayBuffer));
        }

        if (compressionType === 'xz') throw new Error('xz files cannot be opened for editing.');

        throw new Error(`Unknown extension: ${compressionType}`);
    }
}

export class ExcelFile implements ProcessedFile {
    private originalFile: File;
    private compression: SupportedInBrowserCompressionKind | null;
    private tsvFile: File | undefined;
    private processingWarnings: string[];

    constructor(excelFile: File, compression: SupportedInBrowserCompressionKind | null = null) {
        // assumes that the given file is actually an excel file (might be compressed).
        this.originalFile = excelFile;
        this.compression = compression;
        this.processingWarnings = [];
    }

    private async getRawData(): Promise<ArrayBufferLike> {
        const compression = this.compression;
        const buffer = this.originalFile.arrayBuffer();
        return compression === null ? buffer : buffer.then((b) => decompress(b, compression));
    }

    async init() {
        const rawData = await this.getRawData();
        const workbook = XLSX.read(rawData, {
            cellDates: true,
        });

        const firstSheetName = workbook.SheetNames[0];
        let sheet = workbook.Sheets[firstSheetName];

        // convert to JSON and back due to date formatting not working well otherwise
        const json = XLSX.utils.sheet_to_json(sheet);
        sheet = XLSX.utils.json_to_sheet(json, {
            cellDates: true,
            dateNF: 'yyyy-mm-dd', // use this format to 'render' date cells
        });

        const tsvContent = XLSX.utils.sheet_to_csv(sheet, {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            FS: '\t',
            blankrows: false,
        });
        const rowCount = tsvContent.split('\n').length - 1;
        if (rowCount <= 0) {
            throw new Error(`Sheet ${firstSheetName} is empty.`);
        }

        const tsvBlob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
        // filename needs to end in 'tsv' for the uploaded file
        const tsvFile = new File([tsvBlob], 'converted.tsv', { type: 'text/tab-separated-values' });
        this.tsvFile = tsvFile;
        if (workbook.SheetNames.length > 1) {
            this.processingWarnings.push(
                `The file contains ${workbook.SheetNames.length} sheets, only the first sheet (${firstSheetName}; ${rowCount} rows) was processed.`,
            );
        }
    }

    inner(): File {
        if (this.tsvFile === undefined) {
            throw new Error('file was not initialized');
        }
        return this.tsvFile;
    }

    async text(): Promise<string> {
        return this.inner().text();
    }

    handle(): File {
        return this.originalFile;
    }

    header(): Promise<string | null> {
        return Promise.resolve(null)
    }

    warnings(): string[] {
        return this.processingWarnings;
    }
}
