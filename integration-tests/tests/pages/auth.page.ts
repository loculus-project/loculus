import { Page } from '@playwright/test';
import { TestAccount } from '../types/auth.types';

export class AuthPage {
  constructor(private page: Page) {}

  async navigateToRegister() {
    await this.page.goto('http://localhost:3000/');
    await this.page.getByRole('link', { name: 'Login' }).click();
    await this.page.getByRole('link', { name: 'Register' }).click();
  }

  async createAccount(account: TestAccount) {
    await this.navigateToRegister();
    
    await this.page.getByLabel('Username').click();
    await this.page.getByLabel('Username').fill(account.username);
    await this.page.getByLabel('Username').press('Tab');
    
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

  async login(username: string, password: string) {
    await this.page.goto('http://localhost:3000/');
    await this.page.getByRole('link', { name: 'Login' }).click();
    await this.page.getByLabel('Username').fill(username);
    await this.page.getByLabel('Password', { exact: true }).fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
    await this.page.waitForSelector('text=Welcome to Loculus', { state: 'attached' });
  }

  async logout() {
    await this.page.goto('http://localhost:3000/');
    await this.page.getByRole('link', { name: 'My account' }).click();
    await this.page.getByRole('link', { name: 'Logout' }).click();
    await this.page.getByRole('button', { name: 'Logout' }).click();

  }
}
