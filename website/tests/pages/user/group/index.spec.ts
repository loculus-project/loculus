import { v4 } from 'uuid';

import { listOfCountries } from '../../../../src/components/Group/listOfCountries';
import { expect, test, testUser } from '../../../e2e.fixture';

test.describe('The group page', () => {
    test('should see all users of the group, add a user and remove it afterwards', async ({
        groupPage,
        loginAsTestUser,
    }) => {
        const { username } = await loginAsTestUser();

        await groupPage.goToUserPage();
        await groupPage.goToGroupCreationPage();

        const uniqueGroupName = v4();
        await groupPage.createGroup(uniqueGroupName);

        await groupPage.verifyUserIsPresent(username);

        await groupPage.addNewUserToGroup(testUser);

        await groupPage.verifyUserIsPresent(testUser);

        await groupPage.removeUserFromGroup(testUser);

        await groupPage.verifyUserIsNotPresent(testUser);
    });

    test('should edit group info and see changes afterwards', async ({ groupPage, loginAsTestUser }) => {
        await loginAsTestUser();

        await groupPage.goToUserPage();
        await groupPage.goToGroupCreationPage();

        const groupName = v4();
        await groupPage.createGroup(groupName);
        const newName = v4();
        const newInstitution = v4();
        const newEmail = `${v4()}@example.com`;
        const newCountryIndex = 2;
        const newCountry = listOfCountries[newCountryIndex - 1];
        const newLine1 = v4();
        const newLine2 = v4();
        const newCity = v4();
        const newState = v4();
        const newPostalCode = v4();

        await groupPage.goToGroupEditPage();
        await groupPage.editGroupName(newName);
        await groupPage.editInstitution(newInstitution);
        await groupPage.editContactEmail(newEmail);
        await groupPage.editCountry(newCountryIndex);
        await groupPage.editAddressLine1(newLine1);
        await groupPage.editAddressLine2(newLine2);
        await groupPage.editCity(newCity);
        await groupPage.editState(newState);
        await groupPage.editPostalCode(newPostalCode);
        await groupPage.finishEditingGroup();

        await expect(groupPage.page.getByRole('heading', { name: newName })).toBeVisible();

        const tableLocator = groupPage.page.locator('table');

        await expect(tableLocator).toContainText(newInstitution);
        await expect(tableLocator).toContainText(newEmail);
        await expect(tableLocator).toContainText(newLine1);
        await expect(tableLocator).toContainText(newLine2);
        await expect(tableLocator).toContainText(newCity);
        await expect(tableLocator).toContainText(newState);
        await expect(tableLocator).toContainText(newPostalCode);
        await expect(tableLocator).toContainText(newCountry);
    });
});
