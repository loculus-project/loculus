import { Page, expect } from '@playwright/test';
import { TestAccount } from '../types/auth.types';

// Login flows now hit Authelia and registration goes through the dedicated
// registration-service. Selectors target the data-testids exposed by each
// surface so they don't break when the visual layout changes.

export class AuthPage {
    constructor(private page: Page) {}

    async navigateToRegister() {
        // Go directly to the registration service host. Authelia itself doesn't
        // surface a register link by default; in production deployments the
        // operator advertises the registration URL elsewhere.
        const registrationUrl =
            process.env.LOCULUS_REGISTRATION_URL || 'https://register.loculus.test:8443/';
        await this.page.goto(registrationUrl);
        await expect(this.page.getByTestId('register-form')).toBeVisible();
    }

    async createAccount(account: TestAccount, options: { loginAfterCreate?: boolean } = {}) {
        await this.navigateToRegister();

        await this.page.getByTestId('username').fill(account.username);
        await this.page.getByTestId('email').fill(account.email);
        await this.page.getByTestId('first-name').fill(account.firstName);
        await this.page.getByTestId('last-name').fill(account.lastName);
        await this.page.getByTestId('organization').fill(account.organization);
        await this.page.getByTestId('password').fill(account.password);
        await this.page.getByTestId('confirm-password').fill(account.password);
        await this.page.getByTestId('accept-terms').check();
        await Promise.all([
            this.page.waitForURL(/registered=1/, { timeout: 15_000 }),
            this.page.getByTestId('register-submit').click(),
        ]);

        if (options.loginAfterCreate ?? true) {
            expect(await this.login(account.username, account.password)).toBe(true);
        }
    }

    async login(username: string, password: string): Promise<boolean> {
        await this.page.goto('/');
        if (await this.page.getByRole('link', { name: 'My account' }).isVisible()) {
            return true;
        }

        await this.page.getByRole('link', { name: 'Login' }).click();
        const usernameField = this.page.getByRole('textbox', { name: /username/i });
        const accountLink = this.page.getByRole('link', { name: 'My account' });
        const consent = this.page.getByRole('button', { name: /^accept$/i });
        const nextStep = await Promise.race([
            usernameField.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'form'),
            consent.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'consent'),
            accountLink.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'done'),
        ]).catch(() => 'form');

        if (nextStep === 'done') {
            return true;
        }

        if (nextStep === 'consent') {
            await consent.click();
            await accountLink.waitFor({ state: 'visible', timeout: 30_000 });
            return true;
        }

        // Authelia login form — use roles to avoid matching the toggle-visibility
        // button that also has "password" in its aria-label.
        await usernameField.fill(username);
        await this.page.getByRole('textbox', { name: /^password$/i }).fill(password);
        await this.page.getByRole('button', { name: /sign in|log in/i }).click();

        // Authelia shows an OIDC consent screen for the website on first login;
        // accept it if present. We don't gate on it so subsequent logins where
        // consent is remembered work unchanged.
        await consent.click({ timeout: 5000 }).catch(() => {});

        const success = this.page.getByRole('link', { name: 'My account' }).waitFor({
            state: 'visible',
            timeout: 30_000,
        });
        const failure = this.page
            .getByText(/incorrect username or password|invalid|authentication failed/i)
            .first()
            .waitFor({ state: 'attached', timeout: 30_000 });

        return Promise.race([success.then(() => true), failure.then(() => false)]).catch(
            () => false,
        );
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
        await Promise.all([
            this.page.waitForURL(/\/logout$/),
            this.page.getByRole('link', { name: 'Logout' }).click(),
        ]);
        await expect(this.page.getByText('You have been logged out')).toBeVisible();
    }
}
