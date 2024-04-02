import { SeqSetPage } from './seqset.page';
import { authorize, expect, test } from '../../e2e.fixture';

test.describe.configure({ mode: 'serial' });
let testSeqSetManager: SeqSetPage;
const testSeqSetName = 'Test SeqSet 2';

test.describe('The seqSet item page', () => {
    test.beforeEach(async ({ loginAsTestUser }) => {
        await loginAsTestUser();
    });

    test.beforeAll(async ({ browser }) => {
        const page = await browser.newPage();
        await authorize(page);
        testSeqSetManager = new SeqSetPage(page);
        await testSeqSetManager.createTestSeqSet(testSeqSetName);
    });

    test.afterAll(async () => {
        await testSeqSetManager.deleteTestSeqSet(testSeqSetName);
    });

    test('displays layout correctly', async ({ seqSetPage }) => {
        await seqSetPage.gotoDetail(testSeqSetName);

        // SeqSet action buttons
        await expect(seqSetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await expect(seqSetPage.page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(seqSetPage.page.getByRole('button', { name: 'Delete' })).toBeVisible();

        // SeqSet details
        await expect(seqSetPage.page.getByRole('heading', { name: testSeqSetName })).toBeVisible();
        await expect(seqSetPage.page.getByText('Created date')).toBeVisible();
        await expect(seqSetPage.page.getByText('Version', { exact: true })).toBeVisible();
        await expect(seqSetPage.page.getByText('Accession', { exact: true })).toBeVisible();
    });

    test('export functionality allows downloading JSON file', async ({ seqSetPage }) => {
        await seqSetPage.gotoDetail(testSeqSetName);
        await expect(seqSetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await seqSetPage.page.getByRole('button', { name: 'Export' }).click();
        await seqSetPage.waitForLoad();

        await seqSetPage.page.getByTestId('json-radio').waitFor();
        await seqSetPage.page.getByTestId('json-radio').click();
        await expect(seqSetPage.page.getByRole('button', { name: 'Download' })).toBeVisible();
        const [download] = await Promise.all([
            seqSetPage.page.waitForEvent('download'),
            seqSetPage.page.getByRole('button', { name: 'Download' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe(`${testSeqSetName}.json`);
    });

    test('export functionality allows downloading TSV file', async ({ seqSetPage }) => {
        await seqSetPage.gotoDetail(testSeqSetName);
        await expect(seqSetPage.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await seqSetPage.page.getByRole('button', { name: 'Export' }).click();
        await seqSetPage.waitForLoad();

        await seqSetPage.page.getByTestId('tsv-radio').waitFor();
        await seqSetPage.page.getByTestId('tsv-radio').click();
        await expect(seqSetPage.page.getByRole('button', { name: 'Download' })).toBeVisible();
        const [download] = await Promise.all([
            seqSetPage.page.waitForEvent('download'),
            seqSetPage.page.getByRole('button', { name: 'Download' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe(`${testSeqSetName}.tsv`);
    });

    test('delete functionality can be cancelled', async ({ seqSetPage }) => {
        await seqSetPage.gotoDetail(testSeqSetName);
        await expect(seqSetPage.page.getByRole('button', { name: 'Delete' })).toBeVisible();
        await seqSetPage.page.getByRole('button', { name: 'Delete' }).click();
        await seqSetPage.waitForLoad();

        await expect(async () => {
            await seqSetPage.page.getByRole('button', { name: 'Cancel' }).click();
            await seqSetPage.waitForLoad();
            await expect(seqSetPage.page.getByRole('heading', { name: testSeqSetName })).toBeVisible();
        }).toPass();
    });

    test('edit functionality updates seqSet and increases version', async ({ seqSetPage }) => {
        const editSeqSetName = 'Updated seqSet name';
        await seqSetPage.gotoDetail(testSeqSetName);
        await expect(seqSetPage.page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await seqSetPage.page.getByRole('button', { name: 'Edit' }).click();
        await seqSetPage.waitForLoad();

        await expect(async () => {
            await expect(seqSetPage.page.getByText('Edit SeqSet')).toBeVisible();
            await seqSetPage.page.locator('#seqSet-name').fill(editSeqSetName);
            await seqSetPage.page.getByRole('button', { name: 'Save' }).click();
            await seqSetPage.waitForLoad();
            await expect(seqSetPage.page.getByText(editSeqSetName)).toBeVisible();
        }).toPass();

        await seqSetPage.deleteTestSeqSet(editSeqSetName);
    });
});
