import { expect, test, authorize } from '../../e2e.fixture';
import { DatasetPage } from './dataset.page';

test.describe.configure({ mode: 'serial' });
let testDatasetManager: DatasetPage;
const testDatasetName = 'Test Dataset 1';

test.describe('The datasets list page', () => {
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

    test('successfully creates test dataset in beforeAll', async () => {
        await expect(testDatasetManager.page.getByText(testDatasetName)).toBeVisible();
    });

    test('displays create dataset icon and opens modal on click', async ({ datasetPage }) => {
        await datasetPage.gotoList();
        await expect(datasetPage.page.getByTestId('AddIcon')).toBeVisible();

        await expect(async () => {
            await datasetPage.page.getByTestId('AddIcon').click();
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
