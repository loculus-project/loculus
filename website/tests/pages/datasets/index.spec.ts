import { expect, test } from '../../e2e.fixture';
import { DatasetPage } from './dataset.page';

test.describe.configure({ mode: 'serial' });
let testDatasetManager: DatasetPage;
const testDatasetName = 'Test Dataset 1';

test.describe('The datasets list page', () => {
    test.describe('with no existing datasets', () => {
        test('displays empty message', async ({ datasetPage }) => {
            await datasetPage.gotoList();
            await expect(datasetPage.page.getByText('You have no datasets yet.')).toBeVisible();
        });
    });

    test.describe('with existing datatsets', () => {
        // Create test dataset
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            testDatasetManager = new DatasetPage(page);
            await testDatasetManager.createTestDataset(testDatasetName);
        });

        // Delete test dataset
        test.afterAll(async () => {
            await testDatasetManager.deleteTestDataset(testDatasetName);
        });

        test('allows successfully creating dataset', async () => {
            // validate beforeAll hook creates dataset
            await expect(testDatasetManager.page.getByText(testDatasetName)).toBeVisible();
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
            await datasetPage.gotoList();
            await expect(async () => {
                await datasetPage.page.getByText(testDatasetName).first().click();
                await datasetPage.waitForLoad();
                await expect(datasetPage.page.getByRole('heading', { name: testDatasetName })).toBeVisible();
            }).toPass();
        });
    });
});
