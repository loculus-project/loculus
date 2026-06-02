import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
import { test } from '../../fixtures/group.fixture';

test.describe('Sequence Preview Annotations', () => {
    test('does not show EMBL files when preview fixtures disable EMBL generation', async ({
        page,
    }) => {
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

        await expect(page.getByTestId('sequence-preview-modal')).toBeVisible();
        await expect(page.getByText(accessionVersion)).toBeVisible();

        await expect(page.getByRole('heading', { name: 'Files' })).not.toBeVisible();
        await expect(
            page.getByRole('link', { name: `${accessionVersion}.embl` }),
        ).not.toBeVisible();
    });
});
