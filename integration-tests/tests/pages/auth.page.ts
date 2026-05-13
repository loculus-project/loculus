import { Page, expect } from '@playwright/test';
import { TestAccount } from '../types/auth.types';

// Login flows now hit Authelia and registration goes through the dedicated
// registration-service. Selectors target the data-testids exposed by each
// surface so they don't break when the visual layout changes.

export class AuthPage {
    constructor(private page: Page) {}

    async navigateToRegister() {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'Login' }).click();
        // Authelia exposes a "Register" link below the password field that
        // redirects to the registration-service host.
        await this.page.getByRole('link', { name: /register/i }).click();
        await expect(this.page.getByTestId('register-form')).toBeVisible();
    }

    async createAccount(account: TestAccount) {
        await this.navigateToRegister();

        await this.page.getByTestId('username').fill(account.username);
        await this.page.getByTestId('email').fill(account.email);
        await this.page.getByTestId('first-name').fill(account.firstName);
        await this.page.getByTestId('last-name').fill(account.lastName);
        await this.page.getByTestId('organization').fill(account.organization);
        await this.page.getByTestId('password').fill(account.password);
        await this.page.getByTestId('confirm-password').fill(account.password);
        await this.page.getByTestId('accept-terms').check();
        await this.page.getByTestId('register-submit').click();
    }

    async login(username: string, password: string): Promise<boolean> {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'Login' }).click();
        // Authelia login form
        await this.page.getByLabel(/username/i).fill(username);
        await this.page.getByLabel(/password/i).fill(password);
        await this.page.getByRole('button', { name: /sign in|log in/i }).click();

        const successSelector = this.page.waitForSelector('text=Welcome to Loculus', {
            state: 'attached',
        });
        const failureSelector = this.page.waitForSelector(/incorrect username or password|invalid/i, {
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
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'My account' }).click();
        await this.page.getByRole('link', { name: 'Logout' }).click();
        await this.page.getByRole('button', { name: 'Logout' }).click();
        await expect(this.page.getByText('You have been logged out')).toBeVisible();
    }
}
