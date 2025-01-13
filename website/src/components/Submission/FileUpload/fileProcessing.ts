import * as fflate from 'fflate';
import * as fzstd from 'fzstd';
import * as JSZip from 'jszip';
import { Result, ok, err } from 'neverthrow';
import { type SVGProps, type ForwardRefExoticComponent } from 'react';
import * as XLSX from 'xlsx';

import MaterialSymbolsLightDataTableOutline from '~icons/material-symbols-light/data-table-outline';
import PhDnaLight from '~icons/ph/dna-light';

type Icon = ForwardRefExoticComponent<SVGProps<SVGSVGElement>>;

export type FileKind = {
    type: 'metadata' | 'fasta';
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
        if (dataExtension === 'tsv') return ok(new RawFile(file));
        if (dataExtension === 'xlsx' || dataExtension === 'xls') {
            if (isCompressed && compressionExtension === 'xz') {
                return err(
                    new Error(
                        'LZMA compression (.xz files) is not supported with Excel files yet. ' +
                            'Please use a different compression format for Excel files.',
                    ),
                );
            }
            const compression = isCompressed ? (compressionExtension as ExcelCompressionKind) : undefined;
            const excelFile = new ExcelFile(file, compression);
            try {
                await excelFile.init();
            } catch (error) {
                return err(error as Error);
            }
            return ok(excelFile);
        }
        return err(new Error());
    },
};

export const FASTA_FILE_KIND: FileKind = {
    type: 'fasta',
    icon: PhDnaLight,
    supportedExtensions: ['fasta'],
    processRawFile: (file) => Promise.resolve(ok(new RawFile(file))),
};

export interface ProcessedFile {
    /* The file containing the data (might be processed, only exists in memory) */
    inner(): File;

    /* The handle to the file on disk. */
    handle(): File;

    /* Warnings that came up during file processing. */
    warnings(): string[];
}

class RawFile implements ProcessedFile {
    private innerFile: File;

    constructor(file: File) {
        this.innerFile = file;
    }

    inner(): File {
        return this.innerFile;
    }

    handle(): File {
        return this.innerFile;
    }

    warnings(): string[] {
        return [];
    }
}

type SupportedExcelCompressionKind = 'zst' | 'gz' | 'zip';
type NoCompression = null;
type ExcelCompressionKind = NoCompression | SupportedExcelCompressionKind;

class ExcelFile implements ProcessedFile {
    private originalFile: File;
    private compression: ExcelCompressionKind;
    private tsvFile: File | undefined;
    private processingWarnings: string[];

    constructor(excelFile: File, compression: ExcelCompressionKind = null) {
        // assumes that the given file is actually an excel file (might be compressed).
        this.originalFile = excelFile;
        this.compression = compression;
        this.processingWarnings = [];
    }

    private async getRawData(): Promise<ArrayBufferLike> {
        switch (this.compression) {
            case null:
                return this.originalFile.arrayBuffer();
            case 'zst': {
                return this.originalFile.arrayBuffer().then((b) => fzstd.decompress(new Uint8Array(b)).buffer);
            }
            case 'gz': {
                return this.originalFile.arrayBuffer().then((b) => fflate.decompressSync(new Uint8Array(b)).buffer);
            }
            case 'zip': {
                return this.originalFile
                    .arrayBuffer()
                    .then((b) => JSZip.loadAsync(b))
                    .then((zip) => zip.files[Object.keys(zip.files)[0]].async('arraybuffer'));
            }
        }
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

    handle(): File {
        return this.originalFile;
    }

    warnings(): string[] {
        return this.processingWarnings;
    }
}
