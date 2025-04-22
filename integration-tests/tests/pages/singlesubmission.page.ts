import { Page } from '@playwright/test';
import { ReviewPage } from './review.page';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class SingleSequenceSubmissionPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async navigateToSubmissionPage(organism: string = 'Ebola Sudan') {
        await this.page.getByRole('link', { name: 'Submit' }).click();
        await this.page.getByRole('link', { name: organism }).click();
        await this.page.getByRole('link', { name: 'Submit Upload new sequences.' }).click();
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

    async uploadExternalFiles() {
        const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'upload-'));
        await fs.promises.writeFile(path.join(tmpDir, 'hello.txt'), 'Hello');
        await fs.promises.writeFile(path.join(tmpDir, 'world.txt'), 'World');
    
        await this.page.getByTestId('raw_reads').setInputFiles(tmpDir);
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
