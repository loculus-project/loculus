import { createTestGroup, test } from '../../fixtures/group.fixture';
import { GroupPage } from '../../pages/group.page';
import { MyAccountPage } from '../../pages/my-account.page';

test.describe('User group membership', () => {
    test('shows existing groups, allows creating a new group, and leaving it', async ({
        pageWithGroup,
        groupName,
    }) => {
        const myAccountPage = new MyAccountPage(pageWithGroup);
        const groupPage = new GroupPage(pageWithGroup);

        await myAccountPage.goto();
        await myAccountPage.expectGroupVisible(groupName);

        const newGroup = createTestGroup();
        await groupPage.createGroup(newGroup);

        await myAccountPage.goto();
        await myAccountPage.expectGroupVisible(newGroup.name);

        await myAccountPage.openGroup(newGroup.name);
        await groupPage.leaveGroup();

        await myAccountPage.goto();
        await myAccountPage.expectGroupNotVisible(newGroup.name);
    });
});
