import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';

test.describe('Group Features', () => {
  test('group user can access protected features', async ({ pageWithGroup }) => {
    // wait 100 secs
    await new Promise(r => setTimeout(r, 9000));


  });
});
