import { Page, expect } from '@playwright/test';
import { TestAccount } from '../types/auth.types';

export class AuthPage {
    constructor(private page: Page) {}

    async navigateToRegister() {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'Login' }).click();
        await this.page.getByRole('link', { name: 'Register' }).click();
    }

    async createAccount(account: TestAccount) {
        await this.navigateToRegister();

        await this.page.getByLabel('Username').click();
        await this.page.getByLabel('Username').fill(account.username);

        await this.page.getByLabel('Password', { exact: true }).fill(account.password);
        await this.page.getByLabel('Password', { exact: true }).press('Tab');

        await this.page.getByLabel('Confirm password').fill(account.password);
        await this.page.getByLabel('Confirm password').press('Tab');

        await this.page.getByLabel('Email').fill(account.email);
        await this.page.getByLabel('Email').press('Tab');

        await this.page.getByLabel('First name').fill(account.firstName);
        await this.page.getByLabel('First name').press('Tab');

        await this.page.getByLabel('Last name').fill(account.lastName);
        await this.page.getByLabel('Last name').press('Tab');

        await this.page.getByLabel('University / Organisation').fill(account.organization);

        await this.page.getByLabel('I agree').check();
        await this.page.getByRole('button', { name: 'Register' }).click();
    }

    async login(username: string, password: string): Promise<boolean> {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'Login' }).click();
        await this.page.getByLabel('Username').fill(username);
        await this.page.getByLabel('Password', { exact: true }).fill(password);
        await this.page.getByRole('button', { name: 'Sign in' }).click();

        const successSelector = this.page.waitForSelector('text=Welcome to Loculus', {
            state: 'attached',
        });
        const failureSelector = this.page.waitForSelector('text=Invalid username or password', {
            state: 'attached',
        });

        const result = await Promise.race([
            successSelector.then(() => true),
            failureSelector.then(() => false),
        ]);

        return result;
    }

    async tryLoginOrRegister(account: TestAccount) {
        const loggedIn = await this.login(account.username, account.password);
        if (!loggedIn) {
            await this.createAccount(account);
        }
    }

    async logout() {
        await this.page.waitForLoadState('networkidle');
        await this.page.goto('/');
        await this.page.waitForLoadState('networkidle');
        await this.page.getByRole('link', { name: 'My account' }).click();
        await this.page.getByRole('link', { name: 'Logout' }).click();
        await this.page.getByRole('button', { name: 'Logout' }).click();
        await expect(this.page.getByText('You have been logged out')).toBeVisible();
    }
}
