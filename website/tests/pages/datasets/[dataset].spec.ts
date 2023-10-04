import { expect, test } from '../../e2e.fixture';

test.describe('The dataset item page', () => {
    test('displays dataset information', async ({ datasetPage }) => {
        await datasetPage.gotoDetail();
        await expect(datasetPage.page.getByRole('heading', { name: 'Dataset study name 1' })).toBeVisible();
        await expect(datasetPage.page.getByText('Created Dated')).toBeVisible();
        await expect(datasetPage.page.getByText('Sequences')).toBeVisible();
    });

    test('displays export button and downloads file on button click', async ({ datasetPage }) => {
        await datasetPage.gotoDetail();
        await expect(datasetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();

        await datasetPage.page.getByRole('button', { name: 'Export' }).click();

        await expect(datasetPage.page.getByRole('button', { name: 'Download' })).toBeVisible();

        const [download] = await Promise.all([
            datasetPage.page.waitForEvent('download'),
            datasetPage.page.getByRole('button', { name: 'Download' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe('Dataset study name 1.json');
    });

    test('displays edit button and opens edit modal on button click', async ({ datasetPage }) => {
        await datasetPage.gotoDetail();
        await expect(datasetPage.page.getByRole('button', { name: 'Edit' })).toBeVisible();

        await expect(async () => {
            await datasetPage.page.getByRole('button', { name: 'Edit' }).click();
            await datasetPage.waitForLoad();
            await expect(datasetPage.page.getByText('Edit Dataset')).toBeVisible();
        }).toPass();
    });

    test('displays delete button and opens warning dialog on button click', async ({ datasetPage }) => {
        await datasetPage.gotoDetail();
        await expect(datasetPage.page.getByRole('button', { name: 'Delete' })).toBeVisible();

        await expect(async () => {
            await datasetPage.page.getByRole('button', { name: 'Delete' }).click();
            await datasetPage.waitForLoad();
            await expect(datasetPage.page.getByText('Delete Dataset')).toBeVisible();
        }).toPass();
    });
});
