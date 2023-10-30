import type { Page } from '@playwright/test';

import type { SequenceVersion } from '../../../src/types/backend.ts';
import { getSequenceVersionString } from '../../../src/utils/extractSequenceVersion.ts';
import { baseUrl, expect, testuser } from '../../e2e.fixture';

export class ReviewPage {
    private readonly submitButton;
    private readonly downloadButton;

    constructor(public readonly page: Page) {
        this.submitButton = this.page.getByRole('button', { name: 'Submit review' });
        this.downloadButton = this.page.getByRole('button', { name: 'Download', exact: false });
    }

    public async goto(sequenceVersion: SequenceVersion) {
        await this.page.goto(
            `${baseUrl}/user/${testuser}/review/${sequenceVersion.sequenceId}/${sequenceVersion.version}`,
            { waitUntil: 'networkidle' },
        );
    }

    public async submit() {
        await this.submitButton.click();
        expect(await this.page.isVisible('text=Do you really want to submit your review?')).toBe(true);
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.page.waitForURL(`${baseUrl}/user/${testuser}/sequences`);
    }

    public async downloadAndVerify(sequenceVersion: SequenceVersion) {
        const downloadPromise = this.page.waitForEvent('download');
        expect(await this.downloadButton.isVisible()).toBeTruthy();
        await this.downloadButton.click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toContain('sequenceVersion');
        const downloadStream = await download.createReadStream();
        expect(downloadStream).toBeDefined();

        let downloadData = Buffer.from([]);
        downloadStream!.on('data', (chunk) => {
            downloadData = Buffer.concat([downloadData, chunk]);
        });

        await new Promise<void>((resolve) => {
            downloadStream!.on('end', resolve);
        });

        expect(downloadData.toString()).toContain(`>${getSequenceVersionString(sequenceVersion)}.main
ACTG`);
    }
}
