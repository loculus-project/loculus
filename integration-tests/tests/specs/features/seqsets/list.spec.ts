import { expect } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

import { test } from '../../../fixtures/group.fixture';
import { SeqSetPage, defaultSeqSetFormValues } from '../../../pages/seqset.page';

const createSeqSetName = () => `Test SeqSet ${uuidv4().slice(0, 8)}`;

test.describe('SeqSet list page', () => {
    test('allows creating a SeqSet and navigating to its detail page', async ({
        pageWithGroup,
    }) => {
        test.setTimeout(120_000);
        const seqSetPage = new SeqSetPage(pageWithGroup);
        const seqSetName = createSeqSetName();

        await seqSetPage.gotoList();
        await expect(pageWithGroup.getByRole('heading', { name: 'SeqSets' })).toBeVisible({
            timeout: 60_000,
        });
        await expect(pageWithGroup.getByTestId('AddIcon')).toBeVisible({ timeout: 60_000 });

        const seqSetData = {
            name: seqSetName,
            ...defaultSeqSetFormValues,
        };

        try {
            await seqSetPage.createSeqSet(seqSetData);

            await seqSetPage.gotoList();
            await expect(seqSetPage.rowLocator(seqSetName)).toBeVisible({ timeout: 60_000 });

            await seqSetPage.rowLocator(seqSetName).click();
            await expect(pageWithGroup.getByRole('heading', { name: seqSetName })).toBeVisible();
        } finally {
            await seqSetPage.deleteSeqSet(seqSetName).catch(() => undefined);
        }
    });
});
