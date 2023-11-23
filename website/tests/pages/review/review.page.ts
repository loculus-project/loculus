import type { Page } from '@playwright/test';

import type { AccessionVersion } from '../../../src/types/backend.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, expect, testUser } from '../../e2e.fixture';

export class ReviewPage {
    private readonly submitButton;
    private readonly downloadButton;

    constructor(public readonly page: Page) {
        this.submitButton = this.page.getByRole('button', { name: 'Submit review' });
        this.downloadButton = this.page.getByRole('button', { name: 'Download', exact: false });
    }

    public async goto(accessionVersion: AccessionVersion) {
        await this.page.goto(
            `${baseUrl}/${dummyOrganism}/user/${testUser}/review/${accessionVersion.accession}/${accessionVersion.version}`,
            { waitUntil: 'networkidle' },
        );
    }

    public async submit() {
        await this.submitButton.click();
        expect(await this.page.isVisible('text=Do you really want to submit your review?')).toBe(true);
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.page.waitForURL(`${baseUrl}/${dummyOrganism}/user/${testUser}/sequences`);
    }

    public async downloadAndVerify(accessionVersion: AccessionVersion) {
        const downloadPromise = this.page.waitForEvent('download');
        expect(await this.downloadButton.isVisible()).toBeTruthy();
        await this.downloadButton.click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toContain('accessionVersion');
        const downloadStream = await download.createReadStream();
        expect(downloadStream).toBeDefined();

        let downloadData = Buffer.from([]);
        downloadStream!.on('data', (chunk) => {
            downloadData = Buffer.concat([downloadData, chunk]);
        });

        await new Promise<void>((resolve) => {
            downloadStream!.on('end', resolve);
        });

        expect(downloadData.toString()).toContain(`>${getAccessionVersionString(accessionVersion)}.main
ACTG`);
    }
}
