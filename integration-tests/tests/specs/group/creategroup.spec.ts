import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';
import { GroupPage } from '../../pages/group.page';

test.describe('Group creation', () => {
  test('can create group', async ({ pageWithACreatedUser }) => {
    const groupPage = new GroupPage(pageWithACreatedUser);


    // Create a new group
    const groupData = {
      name: 'Test Group',
      email: 'test@example.com',
      institution: 'Test Institution',
      addressLine1: '123 Test Street',
      addressLine2: 'Suite 456',
      city: 'Test City',
      state: 'Test State',
      zipCode: '12345',
      country: 'USA'
    };

    await groupPage.createGroup(groupData);

  });

});