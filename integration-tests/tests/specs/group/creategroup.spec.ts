import { test } from '../../fixtures/auth.fixture';
import { GroupPage } from '../../pages/group.page';
import { buildTestGroup } from '../../utils/testGroup';

test.describe('Group creation', () => {
    test('can create group', async ({ pageWithACreatedUser }) => {
        const groupPage = new GroupPage(pageWithACreatedUser);
        const groupData = buildTestGroup();
        await groupPage.createGroup(groupData);
    });
});
