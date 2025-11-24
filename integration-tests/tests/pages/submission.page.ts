import { Page } from '@playwright/test';
import { ReviewPage } from './review.page';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { NavigationPage } from './navigation.page';
import { clearTmpDir } from '../utils/tmpdir';

class SubmissionPage {
    protected page: Page;
    private navigation: NavigationPage;

    constructor(page: Page) {
        this.page = page;
        this.navigation = new NavigationPage(page);
    }

    async navigateToOrganism(organism: string = 'Ebola Sudan') {
        await this.page.goto('/');
        await this.navigation.openOrganismNavigation();
        await this.navigation.selectOrganism(organism);
        await this.navigation.waitForOrganismNavigationLink('Submit sequences');
    }

    async navigateToSubmissionPage(organism: string = 'Ebola Sudan') {
        await this.navigateToOrganism(organism);
        await this.navigation.clickSubmitSequences();

        // Click on the submit upload link
        await this.page.getByRole('link', { name: 'Submit Upload new sequences.' }).click();
    }

    async discardRawReadsFiles() {
        await this.page.getByTestId('discard_raw_reads').click();
    }

    async acceptTerms() {
        await this.page.getByText('I confirm that the data').click();
        await this.page.getByText('I confirm I have not and will').click();
    }

    // TODO #5357: improve this function by passing in whether we accepted open terms to simplify and also test modal appearance/absence
    async submitSequence(): Promise<ReviewPage> {
        await this.page
            .getByRole('button', { name: 'Submit sequences' })
            .click({ timeout: 10_000 });

        // 'Continue under Open terms' only shows if we are submitting under open terms - but we don't know in this function
        // Void because we're waiting for the review page anyway, so no need to wait for this specifically
        void this.page
            .getByRole('button', { name: 'Continue under Open terms' })
            .click({ timeout: 3_000 })
            .catch(() => {});

        await this.page.waitForURL('**/review', { timeout: 15_000 });
        return new ReviewPage(this.page);
    }

    async submitAndWaitForProcessingDone(): Promise<ReviewPage> {
        await this.acceptTerms();
        const reviewPage = await this.submitSequence();
        await reviewPage.waitForZeroProcessing();
        return reviewPage;
    }

    protected async _uploadFilesFromTmpDir(testId: string, tmpDir: string, fileCount: number) {
        await this.page.getByRole('heading', { name: 'Extra files' }).scrollIntoViewIfNeeded();
        // Trigger file upload (don't await) and wait for checkmarks to appear (indicates success)
        void this.page.getByTestId(testId).setInputFiles(tmpDir);
        return Promise.all(
            Array.from({ length: fileCount }, (_, i) =>
                this.page.getByText('✓').nth(i).waitFor({ state: 'visible' }),
            ),
        );
    }
}

export class SingleSequenceSubmissionPage extends SubmissionPage {
    async navigateToSubmissionPage(organism: string = 'Ebola Sudan') {
        await super.navigateToSubmissionPage(organism);
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
        await this.page.getByLabel('ID', { exact: true }).fill(submissionId);
        await this.page.getByLabel('Collection country').fill(collectionCountry);
        await this.page.getByLabel('Collection country').blur();
        await this.page.getByLabel('Collection date').fill(collectionDate);
        await this.page.getByLabel('Author affiliations').fill(authorAffiliations);
    }

    async fillField(fieldName: string, value: string) {
        await this.page.getByLabel(fieldName).fill(value);
        await this.page.getByLabel(fieldName).blur();
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
        await this.page.getByLabel('ID', { exact: true }).fill(submissionId);
        await this.page.getByLabel('Country').fill(country);
        await this.page.getByLabel('Country').blur();
        await this.page.getByLabel('Date').fill(date);
    }

    async fillSequenceData(sequenceData: Record<string, string>) {
        for (const [key, value] of Object.entries(sequenceData)) {
            await this.page.getByLabel(`${key} segment file`).setInputFiles({
                name: 'example.txt',
                mimeType: 'text/plain',
                buffer: Buffer.from(value),
            });
        }
    }

    async uploadExternalFiles(
        fileId: string,
        fileContents: Record<string, string>,
        tmpDir: string,
    ) {
        await this._prepareTmpDirWithFiles(fileContents, tmpDir);
        const fileCount = Object.keys(fileContents).length;
        await this._uploadFilesFromTmpDir(fileId, tmpDir, fileCount);
    }

    private async _prepareTmpDirWithFiles(fileContents: Record<string, string>, tmpDir: string) {
        await clearTmpDir(tmpDir);

        await Promise.all(
            Object.entries(fileContents).map(([fileName, fileContent]) =>
                fs.promises.writeFile(path.join(tmpDir, fileName), fileContent),
            ),
        );
    }

    async completeSubmission(
        {
            submissionId,
            collectionCountry,
            collectionDate,
            authorAffiliations,
            groupId = undefined,
        }: {
            submissionId: string;
            collectionCountry: string;
            collectionDate: string;
            authorAffiliations: string;
            groupId?: string;
        },
        sequenceData: Record<string, string>,
    ): Promise<ReviewPage> {
        if (groupId) {
            await this.page.goto(`/ebola-sudan/submission/${groupId}/submit`);
            await this.page.getByRole('link', { name: 'Submit single sequence' }).click();
        } else {
            await this.navigateToSubmissionPage();
        }

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

    async uploadSequencesFile(sequenceData: Record<string, string>) {
        const fastaContent = Object.entries(sequenceData)
            .map(([id, sequence]) => `>${id}\n${sequence}`)
            .join('\n');

        await this.page.getByTestId('sequence_file').setInputFiles({
            name: 'sequences.fasta',
            mimeType: 'text/plain',
            buffer: Buffer.from(fastaContent),
        });
    }

    /**
     * The given file contents will be stored in a temp dir and then submitted
     * for the given file ID.
     * @param fileId For which file ID to upload the files.
     * @param fileContents A struct: submissionID -> filename -> filecontent.
     * @param tmpDir The temporary directory to use for storing files.
     */
    async uploadExternalFiles(
        fileId: string,
        fileContents: Record<string, Record<string, string>>,
        tmpDir: string,
    ) {
        await this._prepareTmpDirWithFiles(fileContents, tmpDir);
        const fileCount = Object.values(fileContents).reduce(
            (total, files) => total + Object.keys(files).length,
            0,
        );
        await this._uploadFilesFromTmpDir(fileId, tmpDir, fileCount);
    }

    private async _prepareTmpDirWithFiles(
        fileContents: Record<string, Record<string, string>>,
        tmpDir: string,
    ) {
        await clearTmpDir(tmpDir);

        // Create submission directories and write files
        const submissionIds = Object.keys(fileContents);
        await Promise.all(
            submissionIds.map((submissionId) => fs.promises.mkdir(path.join(tmpDir, submissionId))),
        );
        await Promise.all(
            Object.entries(fileContents).flatMap(([submissionId, files]) => {
                return Object.entries(files).map(([fileName, fileContent]) =>
                    fs.promises.writeFile(path.join(tmpDir, submissionId, fileName), fileContent),
                );
            }),
        );
    }
}
