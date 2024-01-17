import { expect, test } from '../../e2e.fixture';
import { DatasetPage } from './dataset.page';

test.describe.configure({ mode: 'serial' });
let testDatasetManager: DatasetPage;
const testDatasetName = 'Test Dataset 2';

// TODO: remove after new API is merged
test.skip();

test.describe('The dataset item page', () => {
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

    test('displays layout correctly', async ({ datasetPage }) => {
        await datasetPage.gotoDetail(testDatasetName);

        // Author information
        // await expect(datasetPage.page.getByText(testuser)).toBeVisible();

        // Dataset action buttons
        await expect(datasetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await expect(datasetPage.page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(datasetPage.page.getByRole('button', { name: 'Delete' })).toBeVisible();

        // Dataset details
        await expect(datasetPage.page.getByRole('heading', { name: testDatasetName })).toBeVisible();
        await expect(datasetPage.page.getByText('Created Dated')).toBeVisible();
        await expect(datasetPage.page.getByText('Version')).toBeVisible();
        await expect(datasetPage.page.getByText('Sequences')).toBeVisible();
    });

    test('export functionality allows downloading file', async ({ datasetPage }) => {
        await datasetPage.gotoDetail(testDatasetName);
        await expect(datasetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await datasetPage.page.getByRole('button', { name: 'Export' }).click();
        await datasetPage.waitForLoad();

        await expect(datasetPage.page.getByRole('button', { name: 'Download' })).toBeVisible();
        const [download] = await Promise.all([
            datasetPage.page.waitForEvent('download'),
            datasetPage.page.getByRole('button', { name: 'Download' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe(`${testDatasetName}.json`);
    });

    test('edit functionality updates dataset and increases version', async ({ datasetPage }) => {
        const editDatasetName = 'Updated dataset name';
        await datasetPage.gotoDetail(testDatasetName);
        await expect(datasetPage.page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await datasetPage.page.getByRole('button', { name: 'Edit' }).click();
        await datasetPage.waitForLoad();

        await expect(async () => {
            await expect(datasetPage.page.getByText('Edit Dataset')).toBeVisible();
            await datasetPage.page.locator('#dataset-name').fill(editDatasetName);
            await datasetPage.page.getByRole('button', { name: 'Save' }).click();
            await datasetPage.waitForLoad();
            await expect(datasetPage.page.getByText(editDatasetName)).toBeVisible();
        }).toPass();

        // Cleanup new dataset version
        await datasetPage.page.getByRole('button', { name: 'Delete' }).click();
        await datasetPage.page.getByRole('button', { name: 'Confirm' }).click();
    });

    test('delete functionality can be cancelled', async ({ datasetPage }) => {
        // Delete confirm action is covered by afterAll hook
        await datasetPage.gotoDetail(testDatasetName);
        await expect(datasetPage.page.getByRole('button', { name: 'Delete' })).toBeVisible();
        await datasetPage.page.getByRole('button', { name: 'Delete' }).click();
        await datasetPage.waitForLoad();

        await expect(async () => {
            await expect(datasetPage.page.getByText('Delete Dataset')).toBeVisible();
            await datasetPage.page.getByRole('button', { name: 'Cancel' }).click();
            await datasetPage.waitForLoad();
            await expect(datasetPage.page.getByText(testDatasetName)).toBeVisible();
        }).toPass();
    });
});
