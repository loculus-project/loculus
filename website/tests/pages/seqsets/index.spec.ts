import { expect, test, authorize } from '../../e2e.fixture';
import { SeqSetPage } from './seqset.page';

test.describe.configure({ mode: 'serial' });
let testSeqSetManager: SeqSetPage;
const testSeqSetName = 'Test SeqSet 1';

test.describe('The seqSets list page', () => {
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

    test('successfully creates test seqSet in beforeAll', async () => {
        await expect(testSeqSetManager.page.getByRole('heading', { name: testSeqSetName })).toBeVisible();
    });

    test('displays create seqSet icon and opens modal on click', async ({ seqSetPage }) => {
        await seqSetPage.gotoList();
        await expect(seqSetPage.page.getByTestId('AddIcon')).toBeVisible();

        await expect(async () => {
            await seqSetPage.page.getByTestId('AddIcon').click();
            await seqSetPage.waitForLoad();
            await expect(seqSetPage.page.getByText('Create a SeqSet')).toBeVisible();
        }).toPass();
    });

    test('displays list of seqSets in table', async ({ seqSetPage }) => {
        await seqSetPage.gotoList();
        await expect(seqSetPage.page.getByRole('table')).toBeVisible();
    });

    test('displays seqSet details on clicking row', async ({ seqSetPage }) => {
        await seqSetPage.gotoList();
        await expect(async () => {
            await seqSetPage.page.getByText(testSeqSetName).first().click();
            await seqSetPage.waitForLoad();
            await expect(seqSetPage.page.getByRole('heading', { name: testSeqSetName })).toBeVisible();
        }).toPass();
    });
});
