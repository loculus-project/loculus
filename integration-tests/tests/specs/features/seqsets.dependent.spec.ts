import { expect } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

import { test } from '../../fixtures/group.fixture';
import { SearchPage } from '../../pages/search.page';
import { SeqSetPage } from '../../pages/seqset.page';

const ACCESSION_PATTERN = /(LOC_[A-Z0-9]+)/;

async function collectAccessibleAccessions(searchPage: SearchPage): Promise<string[]> {
    const rows = searchPage.getSequenceRows();
    await rows.first().waitFor();

    const rowCount = await rows.count();
    const accessions = new Set<string>();

    for (let index = 0; index < rowCount && accessions.size < 3; index += 1) {
        const rowText = await rows.nth(index).innerText();
        const match = rowText.match(ACCESSION_PATTERN);
        if (match !== null) {
            accessions.add(match[1]);
        }
    }

    if (accessions.size === 0) {
        throw new Error('Unable to find any LOC accession IDs from search results');
    }

    const [first, second] = Array.from(accessions);

    if (second === undefined) {
        return [first, first];
    }

    return [first, second];
}

test.describe('SeqSet management', () => {
    test('authenticated users can create, edit, export, and delete seqsets', async ({
        pageWithGroup,
    }) => {
        test.setTimeout(120_000);

        const page = pageWithGroup;
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const [focalAccession, backgroundAccession] = await collectAccessibleAccessions(searchPage);

        const seqSetPage = new SeqSetPage(page);
        const seqSetName = `SeqSet ${uuidv4().slice(0, 8)}`;
        const seqSetDescription = 'Playwright generated seqset for integration coverage';

        await seqSetPage.gotoList();
        await expect(seqSetPage.getCreateButton()).toBeVisible();

        await seqSetPage.createSeqSet({
            name: seqSetName,
            description: seqSetDescription,
            focalAccessions: [focalAccession],
            backgroundAccessions: [backgroundAccession],
        });

        await seqSetPage.expectDetailLayout(seqSetName);

        const jsonDownload = await seqSetPage.exportSeqSet('json');
        expect(jsonDownload.suggestedFilename()).toContain(seqSetName);

        const tsvDownload = await seqSetPage.exportSeqSet('tsv');
        expect(tsvDownload.suggestedFilename()).toContain(seqSetName);

        await seqSetPage.openDeleteDialog();
        await seqSetPage.cancelDeletion();
        await expect(seqSetPage.getHeading(seqSetName)).toBeVisible();

        const updatedSeqSetName = `${seqSetName} updated`;
        await seqSetPage.editSeqSetName(updatedSeqSetName);
        await expect(seqSetPage.getHeading(updatedSeqSetName)).toBeVisible();

        await seqSetPage.deleteSeqSet();
        await expect(seqSetPage.getCreateButton()).toBeVisible();
        await expect(seqSetPage.page.getByRole('cell', { name: updatedSeqSetName })).toHaveCount(0);
    });
});
