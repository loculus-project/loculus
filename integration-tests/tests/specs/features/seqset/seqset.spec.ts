import { expect } from '@playwright/test';
import { test } from '../../../fixtures/group.fixture';
import { SeqSetPage } from '../../../pages/seqset.page';
import { v4 as uuidv4 } from 'uuid';

const generateName = () => `seqSet_${uuidv4().slice(0, 8)}`;

test.describe('SeqSet operations', () => {
    test('create seqSet appears in list', async ({ pageWithGroup }) => {
        const seqSetPage = new SeqSetPage(pageWithGroup);
        const name = generateName();
        try {
            await seqSetPage.createSeqSet(name);
            await expect(pageWithGroup.getByRole('heading', { name })).toBeVisible();
        } finally {
            await seqSetPage.deleteSeqSet(name);
        }
    });

    test('view details, export, edit and delete seqSet', async ({ pageWithGroup }) => {
        const seqSetPage = new SeqSetPage(pageWithGroup);
        const name = generateName();
        const updatedName = `${name}_updated`;

        try {
            await seqSetPage.createSeqSet(name);
            await seqSetPage.gotoDetail(name);

            // export JSON
            await pageWithGroup.getByRole('button', { name: 'Export' }).click();
            await pageWithGroup.getByTestId('json-radio').click();
            const [jsonDownload] = await Promise.all([
                pageWithGroup.waitForEvent('download'),
                pageWithGroup.getByRole('button', { name: 'Download' }).click(),
            ]);
            expect(jsonDownload.suggestedFilename()).toBe(`${name}.json`);

            // export TSV
            await seqSetPage.gotoDetail(name);
            await pageWithGroup.getByRole('button', { name: 'Export' }).click();
            await pageWithGroup.getByTestId('tsv-radio').click();
            const [tsvDownload] = await Promise.all([
                pageWithGroup.waitForEvent('download'),
                pageWithGroup.getByRole('button', { name: 'Download' }).click(),
            ]);
            expect(tsvDownload.suggestedFilename()).toBe(`${name}.tsv`);

            // edit name
            await seqSetPage.gotoDetail(name);
            await pageWithGroup.getByRole('button', { name: 'Edit' }).click();
            await pageWithGroup.locator('#seqSet-name').fill(updatedName);
            await pageWithGroup.getByRole('button', { name: 'Save' }).click();
            await expect(
                pageWithGroup.getByText(updatedName).locator('visible=true'),
            ).toBeVisible();

            // delete
            await seqSetPage.deleteSeqSet(updatedName);
        } finally {
            // cleanup in case deletion failed
            await seqSetPage.deleteSeqSet(updatedName).catch(() => {});
            await seqSetPage.deleteSeqSet(name).catch(() => {});
        }
    });
});
