import { expect } from '@playwright/test';
import { randomUUID } from 'crypto';

import { test } from '../../fixtures/group.fixture';
import { SearchPage } from '../../pages/search.page';
import { SeqSetPage } from '../../pages/seqset.page';
import { collectAccessibleAccessions } from '../../utils/seqsetTestData';

test.describe('SeqSet management', () => {
    test('authenticated users can create, edit, export, and delete seqsets', async ({
        page,
        groupId,
    }) => {
        test.setTimeout(120_000);
        void groupId;
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const [focalAccession, backgroundAccession] = await collectAccessibleAccessions(searchPage);

        const seqSetPage = new SeqSetPage(page);
        const seqSetName = `SeqSet ${randomUUID().slice(0, 8)}`;
        const seqSetDescription = 'Playwright generated seqset for integration coverage';

        await seqSetPage.gotoList();
        await expect(seqSetPage.getCreateButton()).toBeVisible();

        await seqSetPage.createSeqSet({
            name: seqSetName,
            description: seqSetDescription,
            focalAccessions: [focalAccession],
            backgroundAccessions: [backgroundAccession],
        });
        await seqSetPage.expectDetailLayout(seqSetName, seqSetDescription, '1');

        const jsonDownload = await seqSetPage.exportSeqSet('json');
        expect(jsonDownload.suggestedFilename()).toContain(seqSetName);

        const tsvDownload = await seqSetPage.exportSeqSet('tsv');
        expect(tsvDownload.suggestedFilename()).toContain(seqSetName);

        await seqSetPage.openDeleteDialog();
        await seqSetPage.cancelDeletion();

        const updatedSeqSetName = `${seqSetName} updated`;
        const updatedSeqSetDescription = `${seqSetDescription} (updated)`;
        await seqSetPage.editSeqSet(updatedSeqSetName, updatedSeqSetDescription);
        await seqSetPage.expectDetailLayout(updatedSeqSetName, updatedSeqSetDescription, '2');

        await seqSetPage.deleteSeqSet();
        await expect(seqSetPage.getCreateButton()).toBeVisible();
        await expect(seqSetPage.page.getByRole('cell', { name: updatedSeqSetName })).toHaveCount(0);
    });
});
