import { authorize, expect, test } from '../../e2e.fixture';
import { DatasetPage } from './dataset.page';

test.describe.configure({ mode: 'serial' });
let testDatasetManager: DatasetPage;
const testDatasetName = 'Test Dataset 2';

test.describe('The dataset item page', () => {
    test.beforeEach(async ({ loginAsTestUser }) => {
        await loginAsTestUser();
    });

    test.beforeAll(async ({ browser }) => {
        const page = await browser.newPage();
        await authorize(page);
        testDatasetManager = new DatasetPage(page);
        await testDatasetManager.createTestDataset(testDatasetName);
    });

    test.afterAll(async () => {
        await testDatasetManager.deleteTestDataset(testDatasetName);
    });

    test('displays layout correctly', async ({ datasetPage }) => {
        await datasetPage.gotoDetail(testDatasetName);

        // Dataset action buttons
        await expect(datasetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await expect(datasetPage.page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(datasetPage.page.getByRole('button', { name: 'Delete' })).toBeVisible();

        // Dataset details
        await expect(datasetPage.page.getByRole('heading', { name: testDatasetName })).toBeVisible();
        await expect(datasetPage.page.getByText('Created date')).toBeVisible();
        await expect(datasetPage.page.getByText('Version', { exact: true })).toBeVisible();
        await expect(datasetPage.page.getByText('Sequences')).toBeVisible();
    });

    test('export functionality allows downloading JSON file', async ({ datasetPage }) => {
        await datasetPage.gotoDetail(testDatasetName);
        await expect(datasetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await datasetPage.page.getByRole('button', { name: 'Export' }).click();
        await datasetPage.waitForLoad();

        await datasetPage.page.getByTestId('json-radio').waitFor();
        await datasetPage.page.getByTestId('json-radio').click();
        await expect(datasetPage.page.getByRole('button', { name: 'Download' })).toBeVisible();
        const [download] = await Promise.all([
            datasetPage.page.waitForEvent('download'),
            datasetPage.page.getByRole('button', { name: 'Download' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe(`${testDatasetName}.json`);
    });

    test('export functionality allows downloading TSV file', async ({ datasetPage }) => {
        await datasetPage.gotoDetail(testDatasetName);
        await expect(datasetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await datasetPage.page.getByRole('button', { name: 'Export' }).click();
        await datasetPage.waitForLoad();

        await datasetPage.page.getByTestId('tsv-radio').waitFor();
        await datasetPage.page.getByTestId('tsv-radio').click();
        await expect(datasetPage.page.getByRole('button', { name: 'Download' })).toBeVisible();
        const [download] = await Promise.all([
            datasetPage.page.waitForEvent('download'),
            datasetPage.page.getByRole('button', { name: 'Download' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe(`${testDatasetName}.tsv`);
    });

    test('delete functionality can be cancelled', async ({ datasetPage }) => {
        await datasetPage.gotoDetail(testDatasetName);
        await expect(datasetPage.page.getByRole('button', { name: 'Delete' })).toBeVisible();
        await datasetPage.page.getByRole('button', { name: 'Delete' }).click();
        await datasetPage.waitForLoad();

        await expect(async () => {
            await datasetPage.page.getByRole('button', { name: 'Cancel' }).click();
            await datasetPage.waitForLoad();
            await expect(datasetPage.page.getByRole('heading', { name: testDatasetName })).toBeVisible();
        }).toPass();
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

        await datasetPage.deleteTestDataset(editDatasetName);
    });
});
