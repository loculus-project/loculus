import { expect } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

import { test } from '../../../fixtures/group.fixture';
import { SeqSetPage, defaultSeqSetFormValues } from '../../../pages/seqset.page';

const createSeqSetName = () => `Detail SeqSet ${uuidv4().slice(0, 8)}`;

test.describe('SeqSet detail page', () => {
    test('supports exporting, editing, and cancelling deletion', async ({ pageWithGroup }) => {
        test.setTimeout(180_000);
        const seqSetPage = new SeqSetPage(pageWithGroup);
        const initialName = createSeqSetName();
        const seqSetData = {
            name: initialName,
            ...defaultSeqSetFormValues,
        };

        let currentName = initialName;

        try {
            await seqSetPage.createSeqSet(seqSetData);

            await expect(pageWithGroup.getByRole('button', { name: 'Export' })).toBeVisible();
            await expect(pageWithGroup.getByRole('button', { name: 'Edit' })).toBeVisible();
            await expect(pageWithGroup.getByRole('button', { name: 'Delete' })).toBeVisible();

            await pageWithGroup.getByRole('button', { name: 'Export' }).click();
            await expect(pageWithGroup.getByTestId('json-radio')).toBeVisible();
            const jsonDownload = pageWithGroup.waitForEvent('download');
            await pageWithGroup.getByRole('button', { name: 'Download' }).click();
            const jsonFile = await jsonDownload;
            expect(jsonFile.suggestedFilename()).toBe(`${currentName}.json`);
            await pageWithGroup.keyboard.press('Escape');

            await pageWithGroup.getByRole('button', { name: 'Export' }).click();
            await pageWithGroup.getByTestId('tsv-radio').click();
            const tsvDownload = pageWithGroup.waitForEvent('download');
            await pageWithGroup.getByRole('button', { name: 'Download' }).click();
            const tsvFile = await tsvDownload;
            expect(tsvFile.suggestedFilename()).toBe(`${currentName}.tsv`);
            await pageWithGroup.keyboard.press('Escape');

            await pageWithGroup.getByRole('button', { name: 'Delete' }).click();
            await pageWithGroup.getByRole('button', { name: 'Cancel' }).click();
            await expect(pageWithGroup.getByRole('heading', { name: currentName })).toBeVisible();

            const updatedName = `Updated ${currentName}`;
            await pageWithGroup.getByRole('button', { name: 'Edit' }).click();
            await expect(pageWithGroup.getByText('Edit SeqSet')).toBeVisible();
            await pageWithGroup.locator('#seqSet-name').fill(updatedName);
            await pageWithGroup.getByRole('button', { name: 'Save' }).click();
            await expect(pageWithGroup.getByRole('heading', { name: updatedName })).toBeVisible({
                timeout: 60_000,
            });
            currentName = updatedName;
        } finally {
            await seqSetPage.deleteSeqSet(currentName).catch(() => undefined);
        }
    });
});
