import type { Page } from '@playwright/test';

import { baseUrl, testuser } from '../../e2e.fixture';

export class UserPage {
    constructor(public readonly page: Page) {}

    public async goto() {
        await this.page.goto(`${baseUrl}/user/${testuser}/sequences`);
    }
}
