import { Page } from '@playwright/test';
import { ReviewPage } from './review.page';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Papa from 'papaparse';

class SubmissionPage {
    protected page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async navigateToSubmissionPage(organism: string = 'Ebola Sudan') {
        await this.page.getByRole('link', { name: 'Submit' }).click();
        await this.page.getByRole('link', { name: organism }).click();
        await this.page.getByRole('link', { name: 'Submit Upload new sequences.' }).click();
    }

    async acceptTerms() {
        await this.page.getByText('I confirm that the data').click();
        await this.page.getByText('I confirm I have not and will').click();
    }

    async submitSequence(): Promise<ReviewPage> {
        await this.page.getByRole('button', { name: 'Submit sequences' }).click();
        await this.page.waitForURL('**\/review');
        return new ReviewPage(this.page);
    }
}

export class SingleSequenceSubmissionPage extends SubmissionPage {
    async navigateToSubmissionPage(organism: string = 'Ebola Sudan') {
        super.navigateToSubmissionPage(organism);
        await this.page.getByRole('link', { name: 'Submit single sequence' }).click();
    }

    async fillSubmissionForm({
        submissionId,
        collectionCountry,
        collectionDate,
        authorAffiliations,
    }: {
        submissionId: string;
        collectionCountry: string;
        collectionDate: string;
        authorAffiliations: string;
    }) {
        await this.page.getByLabel('Submission ID:').fill(submissionId);
        await this.page.getByLabel('Collection country:').fill(collectionCountry);
        await this.page.getByLabel('Collection country:').blur();
        await this.page.getByLabel('Collection date:').fill(collectionDate);
        await this.page.getByLabel('Author affiliations:').fill(authorAffiliations);
    }

    async fillSubmissionFormDummyOrganism({
        submissionId,
        country,
        date,
    }: {
        submissionId: string;
        country: string;
        date: string;
    }) {
        await this.page.getByLabel('Submission ID:').fill(submissionId);
        await this.page.getByLabel('Country:').fill(country);
        await this.page.getByLabel('Country:').blur();
        await this.page.getByLabel('Date:').fill(date);
    }

    async fillSequenceData(sequenceData: Record<string, string>) {
        Object.entries(sequenceData).forEach(async ([key, value]) => {
            await this.page.getByLabel(`${key} segment file`).setInputFiles({
                name: 'example.txt',
                mimeType: 'text/plain',
                buffer: Buffer.from(value),
            });
        });
    }

    async uploadExternalFiles(
        fileId: string,
        fileContents: Record<string, string>,
    ): Promise<() => Promise<void>> {
        const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'upload-'));
        await Promise.all(
            Object.entries(fileContents).map(([fileName, fileContent]) =>
                fs.promises.writeFile(path.join(tmpDir, fileName), fileContent),
            ),
        );

        await this.page.getByTestId(fileId).setInputFiles(tmpDir);

        return () => fs.promises.rm(tmpDir, { recursive: true, force: true });
    }

    async completeSubmission(
        {
            submissionId,
            collectionCountry,
            collectionDate,
            authorAffiliations,
        }: {
            submissionId: string;
            collectionCountry: string;
            collectionDate: string;
            authorAffiliations: string;
        },
        sequenceData: Record<string, string>,
    ): Promise<ReviewPage> {
        await this.navigateToSubmissionPage();
        await this.fillSubmissionForm({
            submissionId,
            collectionCountry,
            collectionDate,
            authorAffiliations,
        });
        await this.fillSequenceData(sequenceData);
        await this.acceptTerms();
        return this.submitSequence();
    }
}

export class BulkSubmissionPage extends SubmissionPage {
    /**
     * Upload a metadata file with the given content.
     * Content is provided as list(s) of strings, and will be formatted into a TSV file.
     * @param headers The header row cells in the TSV file. The column headers need to be valid input field names.
     * @param rows A list of rows. For each row, a value for each column must be given.
     */
    async uploadMetadataFile(headers: string[], rows: (string | number)[][]) {
        const tsvContent = Papa.unparse([headers, ...rows], {
            delimiter: '\t',
            newline: '\n',
        });

        await this.page.getByTestId('metadata_file').setInputFiles({
            name: 'metadata.tsv',
            mimeType: 'text/plain',
            buffer: Buffer.from(tsvContent),
        });
    }

    /**
     * The given file contents will be stored in a temp dir and then submitted
     * for the given file ID.
     * @param fileId For which file ID to upload the files.
     * @param fileContents A struct: submissionID -> filename -> filecontent.
     * @returns Returns a function to be called to delete the tmp dir again.
     */
    async uploadExternalFiles(
        fileId: string,
        fileContents: Record<string, Record<string, string>>,
    ): Promise<() => Promise<void>> {
        const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'upload-'));
        const submissionIds = Object.keys(fileContents);
        void Promise.all(
            submissionIds.map((submissionId) => fs.promises.mkdir(path.join(tmpDir, submissionId))),
        );
        void Promise.all(
            Object.entries(fileContents).flatMap(([submissionId, files]) => {
                return Object.entries(files).map(([fileName, fileContent]) =>
                    fs.promises.writeFile(path.join(tmpDir, submissionId, fileName), fileContent),
                );
            }),
        );

        await this.page.getByTestId(fileId).setInputFiles(tmpDir);

        return () => fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
}
