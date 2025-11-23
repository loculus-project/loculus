import { test } from '../../fixtures/group.fixture';
import { GroupPage } from '../../pages/group.page';
import { MyAccountPage } from '../../pages/my-account.page';
import { buildTestGroup } from '../../utils/testGroup';

test.describe('User group membership', () => {
    test('shows existing groups, allows creating a new group, and leaving it', async ({
        page,
        groupName,
        groupId,
    }) => {
        // Ensure group is created by depending on groupId
        void groupId;

        const myAccountPage = new MyAccountPage(page);
        const groupPage = new GroupPage(page);

        await myAccountPage.goto();
        await myAccountPage.expectGroupVisible(groupName);

        const newGroup = buildTestGroup();
        await groupPage.createGroup(newGroup);

        await myAccountPage.goto();
        await myAccountPage.expectGroupVisible(newGroup.name);

        await myAccountPage.openGroup(newGroup.name);
        await groupPage.leaveGroup();

        await myAccountPage.goto();
        await myAccountPage.expectGroupNotVisible(newGroup.name);
    });
});
