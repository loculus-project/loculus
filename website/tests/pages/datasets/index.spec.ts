import { expect, test, testDatasetId } from '../../e2e.fixture';

test.describe('The datasets list page', () => {
    test('displays list of datasets in table', async ({ datasetPage }) => {
        await datasetPage.gotoList();
        await expect(datasetPage.page.getByRole('table')).toBeVisible();
    });

    test('displays dataset details on clicking row', async ({ datasetPage }) => {
        await datasetPage.gotoList();
        await expect(datasetPage.page.getByText('dataset_id_2')).toBeVisible();

        await expect(async () => {
            await datasetPage.page.getByText(testDatasetId).click();
            await datasetPage.waitForLoad();
            await expect(datasetPage.page.getByRole('heading', { name: 'Dataset Name Placeholder 1' })).toBeVisible();
        }).toPass();
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
});
