import { type EditPage } from './edit.page.ts';
import { routes } from '../../../src/routes.ts';
import type { AccessionVersion } from '../../../src/types/backend.ts';
import { baseUrl, dummyOrganism, expect, test } from '../../e2e.fixture';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';
import type { UserSequencePage } from '../user/userSequencePage/userSequencePage.ts';

test.describe('The edit page', () => {
    test(
        'should show the edit page for a sequence entry that has errors, ' +
            'download the sequence and submit the edited data',
        async ({ userPage, editPage, loginAsTestUser }) => {
            const { token, groupName } = await loginAsTestUser();

            const [erroneousTestSequenceEntry] = await prepareDataToBe('erroneous', token, 1, groupName);
            const [stagedTestSequenceEntry] = await prepareDataToBe('awaitingApproval', token, 1, groupName);

            expect(erroneousTestSequenceEntry).toBeDefined();
            expect(stagedTestSequenceEntry).toBeDefined();

            await userPage.gotoUserSequencePage();

            await testEditFlow(editPage, userPage, erroneousTestSequenceEntry);
            await testEditFlow(editPage, userPage, stagedTestSequenceEntry);
        },
    );

    const testEditFlow = async (editPage: EditPage, userPage: UserSequencePage, testSequence: AccessionVersion) => {
        await userPage.clickOnEditForSequenceEntry(testSequence);

        expect(await editPage.page.isVisible(`text=Edit Id: ${testSequence.accession}`)).toBe(true);
        expect(await editPage.page.isVisible(`text=Original Data`)).toBe(true);
        expect(await editPage.page.isVisible(`text=Processed Data`)).toBe(true);

        await editPage.downloadAndVerify(testSequence);

        await editPage.submit();

        await editPage.page.waitForURL(`${baseUrl}${routes.userSequencesPage(dummyOrganism.key)}`);
    };
});
