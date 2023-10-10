import { expect, test, testDataset, testuser } from '../../e2e.fixture';

test.describe('The dataset item page', () => {
    test('displays layout correctly', async ({ datasetPage }) => {
        await datasetPage.gotoDetail();

        // Author information
        await expect(datasetPage.page.getByText(testuser)).toBeVisible();

        // Dataset action buttons
        await expect(datasetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await expect(datasetPage.page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(datasetPage.page.getByRole('button', { name: 'Delete' })).toBeVisible();

        // Dataset details
        await expect(datasetPage.page.getByRole('heading', { name: testDataset.name })).toBeVisible();
        await expect(datasetPage.page.getByText('Created Dated')).toBeVisible();
        await expect(datasetPage.page.getByText('Version')).toBeVisible();
        await expect(datasetPage.page.getByText('Sequences')).toBeVisible();
    });

    test('export functionality allows downloading file', async ({ datasetPage }) => {
        await datasetPage.gotoDetail();
        await expect(datasetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await datasetPage.page.getByRole('button', { name: 'Export' }).click();
        await datasetPage.waitForLoad();

        await expect(datasetPage.page.getByRole('button', { name: 'Download' })).toBeVisible();
        const [download] = await Promise.all([
            datasetPage.page.waitForEvent('download'),
            datasetPage.page.getByRole('button', { name: 'Download' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe(`${testDataset?.name}.json`);
        await datasetPage.deleteLastDataset();
    });

    test('edit functionality updates dataset and increases version', async ({ datasetPage }) => {
        const editDatasetName = 'Updated dataset name';
        await datasetPage.gotoDetail();
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
    });

    test('delete functionality can be cancelled', async ({ datasetPage }) => {
        // Delete confirm action is covered by clean up hook in e2e.fixture.ts
        await datasetPage.gotoDetail();
        await expect(datasetPage.page.getByRole('button', { name: 'Delete' })).toBeVisible();
        await datasetPage.page.getByRole('button', { name: 'Delete' }).click();
        await datasetPage.waitForLoad();

        await expect(async () => {
            await expect(datasetPage.page.getByText('Delete Dataset')).toBeVisible();
            await datasetPage.page.getByRole('button', { name: 'Cancel' }).click();
            await datasetPage.waitForLoad();
            await expect(datasetPage.page.getByText(testDataset?.name)).toBeVisible();
        }).toPass();
    });
});
