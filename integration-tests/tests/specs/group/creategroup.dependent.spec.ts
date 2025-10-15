import { test } from '../../fixtures/auth.fixture';
import { GroupPage } from '../../pages/group.page';
import { testScreenshot } from '../../utils/screenshot';

test.describe('Group creation', () => {
    test('can create group', async ({ pageWithACreatedUser }) => {
        const groupPage = new GroupPage(pageWithACreatedUser);

        const groupData = {
            name: 'Test Group',
            email: 'test@example.com',
            institution: 'Test Institution',
            addressLine1: '123 Test Street',
            addressLine2: 'Suite 456',
            city: 'Test City',
            state: 'Test State',
            zipCode: '12345',
            country: 'USA',
        };

        await groupPage.createGroup(groupData);
        await testScreenshot(pageWithACreatedUser, 'group-created.png');
    });
});
