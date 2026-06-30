import { expect } from '@playwright/test';
import { randomUUID } from 'crypto';

import { test } from '../../fixtures/auth.fixture';
import { AdminPage } from '../../pages/admin.page';
import { AuthPage } from '../../pages/auth.page';
import { SearchPage } from '../../pages/search.page';
import { SeqSetPage } from '../../pages/seqset.page';
import { collectAccessibleAccessions } from '../../utils/seqsetTestData';

test.describe('Admin SeqSet citations', () => {
    test('a super user can manually add and remove a SeqSet citation', async ({ page }) => {
        test.setTimeout(120_000);

        const authPage = new AuthPage(page);
        const loggedIn = await authPage.login('superuser', 'superuser');
        expect(loggedIn).toBe(true);

        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        const [focalAccession] = await collectAccessibleAccessions(searchPage);

        const seqSetPage = new SeqSetPage(page);
        const seqSetName = `Citation target SeqSet ${randomUUID().slice(0, 8)}`;

        await seqSetPage.gotoList();
        await seqSetPage.createSeqSet({
            name: seqSetName,
            focalAccessions: [focalAccession],
        });
        await seqSetPage.expectAccessionMatchesUrl();
        const seqSetAccessionVersion = page.url().split('/seqsets/')[1];

        const adminPage = new AdminPage(page);
        const sourceDOI = `10.1234/test-citation-${randomUUID().slice(0, 8)}`;
        const citationTitle = `Manually curated citation ${randomUUID().slice(0, 8)}`;

        await adminPage.gotoDashboard();
        await adminPage.addCitation({
            sourceDOI,
            title: citationTitle,
            year: 2026,
            contributors: ['Jane Doe'],
            seqSetAccessionVersions: [seqSetAccessionVersion],
        });

        const citationRow = adminPage.getCitationRow(sourceDOI);
        await expect(citationRow).toBeVisible();
        await expect(citationRow).toContainText(citationTitle);
        await expect(citationRow).toContainText(seqSetAccessionVersion);

        await adminPage.deleteCitation(sourceDOI);
    });
});
