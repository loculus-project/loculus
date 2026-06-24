import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
import { test } from '../../fixtures/group.fixture';

test.describe('Sequence Preview Annotations', () => {
    test('shows generated EMBL files', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        await searchPage.enableSearchFields(
            'Author affiliations',
            'Submitting group',
            'Submission ID',
        );

        // use this to find our pre-made sequence
        await searchPage.fill('Submission ID', 'foobar');
        await searchPage.fill('Author affiliations', 'Patho Institute, Paris');

        const accessionVersion = await searchPage.clickOnSequenceAndGetAccession(0);

        const modal = page.getByTestId('sequence-preview-modal');
        await expect(modal).toBeVisible();
        await expect(modal.getByText(accessionVersion)).toBeVisible();

        await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
        await expect(page.getByRole('link', { name: `${accessionVersion}.embl` })).toBeVisible();
    });
});
