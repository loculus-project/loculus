import { type SVGProps, type ForwardRefExoticComponent } from 'react';
import * as XLSX from 'xlsx';

import MaterialSymbolsLightDataTableOutline from '~icons/material-symbols-light/data-table-outline';
import PhDnaLight from '~icons/ph/dna-light';

type Icon = ForwardRefExoticComponent<SVGProps<SVGSVGElement>>;

export type FileKind = {
    type: 'metadata' | 'fasta';
    icon: Icon;
    supportedExtensions: string[];
    processRawFile: (file: File) => Promise<ProcessedFile | Error>;
};

export const METADATA_FILE_KIND: FileKind = {
    type: 'metadata',
    icon: MaterialSymbolsLightDataTableOutline,
    supportedExtensions: ['tsv', 'xlsx', 'xls'],
    processRawFile: async (file: File) => {
        switch (file.type) {
            case 'application/vnd.ms-excel':
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                const f = new ExcelFile(file);
                try {
                    await f.init();
                } catch (err) {
                    return err as Error;
                }
                return f;
            }
            default:
                return new RawFile(file);
        }
    },
};

export const FASTA_FILE_KIND: FileKind = {
    type: 'fasta',
    icon: PhDnaLight,
    supportedExtensions: ['fasta'],
    processRawFile: (file) => Promise.resolve(new RawFile(file)),
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

class ExcelFile implements ProcessedFile {
    private originalFile: File;
    private tsvFile: File | undefined;
    private processingWarnings: string[];

    constructor(excelFile: File) {
        // assumes that the given file is actually an execel file.
        this.originalFile = excelFile;
        this.processingWarnings = [];
    }

    async init() {
        const arrayBuffer = await this.originalFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {
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
