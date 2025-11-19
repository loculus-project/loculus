import { test } from '../../fixtures/auth.fixture';
import { GroupPage } from '../../pages/group.page';
import { buildTestGroup } from '../../utils/testGroup';

test.describe('Group creation', () => {
    test('can create group', async ({ page, authenticatedUser }) => {
        void authenticatedUser;
        const groupPage = new GroupPage(page);
        const groupData = buildTestGroup();
        await groupPage.createGroup(groupData);
    });
});
