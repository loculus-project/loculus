import { expect, test, testDataset } from '../../e2e.fixture';

test.describe('The datasets list page', () => {
    test('allows successfully creating dataset', async ({ datasetPage }) => {
        // Note: this test validates before/after hooks in e2e.fixture.ts
        await expect(datasetPage.page.getByText(testDataset?.name)).toBeVisible();
    });

    test('displays create dataset icon and opens modal on click', async ({ datasetPage }) => {
        await datasetPage.gotoList();
        await expect(datasetPage.page.getByTestId('AddToPhotosIcon')).toBeVisible();

        await expect(async () => {
            await datasetPage.page.getByTestId('AddToPhotosIcon').click();
            await datasetPage.waitForLoad();
            await expect(datasetPage.page.getByText('Create Dataset')).toBeVisible();
        }).toPass();
    });

    test('displays list of datasets in table', async ({ datasetPage }) => {
        await datasetPage.gotoList();
        await expect(datasetPage.page.getByRole('table')).toBeVisible();
    });

    test('displays dataset details on clicking row', async ({ datasetPage }) => {
        await datasetPage.createTestDataset();
        await datasetPage.gotoList();
        await expect(async () => {
            await datasetPage.page
                .getByText(testDataset?.name)
                .first()
                .click();
            await datasetPage.waitForLoad();
            await expect(datasetPage.page.getByRole('heading', { name: testDataset?.name })).toBeVisible();
        }).toPass();
        await datasetPage.deleteLastDataset();
    });
});
