import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { SearchPage } from '../../pages/search.page';
import { SeqSetPage } from '../../pages/seqset.page';

// This test relies on the sequence created in readonly.setup.ts

test('create a seqset from an available sequence', async ({ pageWithGroup }) => {
    const searchPage = new SearchPage(pageWithGroup);
    await searchPage.ebolaSudan();

    const accession = await searchPage.waitForLoculusId();
    expect(accession).toBeTruthy();

    const seqSetPage = new SeqSetPage(pageWithGroup);
    const seqSetName = `Test SeqSet ${Date.now()}`;

    await seqSetPage.createSeqSet(seqSetName, 'created in test', accession!);

    await expect(pageWithGroup.getByRole('heading', { name: seqSetName })).toBeVisible();
});
