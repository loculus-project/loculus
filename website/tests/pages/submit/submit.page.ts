import { readFileSync } from 'fs';

import type { Locator, Page } from '@playwright/test';

import { baseUrl, testuser } from '../../e2e.fixture';

export type SubmitResponse = { sequenceId: number; customId: string };
export class SubmitPage {
    public readonly userField: Locator;
    public readonly submitButton: Locator;
    private readonly metadataFile: string = './tests/pages/submit/metadata.tsv';
    private readonly sequencesFile: string = './tests/pages/submit/sequences.fasta';
    private readonly testSequenceCount: number = readFileSync(this.metadataFile, 'utf-8').split('\n').length - 2;

    constructor(public readonly page: Page) {
        this.submitButton = page.getByRole('button', { name: 'Submit' });
        this.userField = page.getByPlaceholder('Username');
    }

    public async goto() {
        await this.page.goto(`${baseUrl}/submit`);
    }

    public async submit() {
        await Promise.all([this.uploadSequenceData(), this.setUsername(testuser), this.uploadMetadata()]);
        await this.submitButton.click();
    }

    public async uploadMetadata(file: string = this.metadataFile) {
        await this.page.getByPlaceholder('Metadata File:').setInputFiles(file);
    }

    public async uploadSequenceData(file: string = this.sequencesFile) {
        await this.page.getByPlaceholder('Sequences File:').setInputFiles(file);
    }

    public async submitDataViaApi(): Promise<SubmitResponse[]> {
        const formData = new FormData();
        formData.append(
            'metadataFile',
            new Blob([readFileSync(this.metadataFile, 'utf-8')], { type: 'text/tab-separated-values' }),
            'metadata.tsv',
        );
        formData.append(
            'sequenceFile',
            new Blob([readFileSync(this.sequencesFile, 'utf-8')], { type: 'application/octet-stream' }),
            'sequences.fasta',
        );

        const requestOptions = {
            method: 'POST',
            headers: {
                accept: 'application/json',
            },
            body: formData,
        };

        const apiUrl = 'http://localhost:8079/submit?username=testuser';

        try {
            const response = await fetch(apiUrl, requestOptions);

            if (response.ok) {
                return (await response.json()) as SubmitResponse[];
            } else {
                throw new Error(`Unexpected response: ${response.statusText}`);
            }
        } catch (error) {
            throw new Error(JSON.stringify(error));
        }
    }

    public getTestSequenceCount() {
        return this.testSequenceCount;
    }

    public async setUsername(username: string) {
        await this.userField.fill(username);
    }
}
