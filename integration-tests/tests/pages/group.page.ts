import { expect, Page } from '@playwright/test';
import { TestAccount } from '../types/auth.types';

interface GroupData {
  name: string;
  email: string;
  institution: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  zipCode: string;
  country: string;
}

export class GroupPage {
  constructor(private page: Page) {}

  async navigateToCreateGroupPage() {
    await this.page.goto('http://localhost:3000/');
    await this.page.getByRole('link', { name: 'My account' }).click();
    await this.page.getByRole('link', { name: 'Create a new submitting group' }).click();
  }

  async createGroup(groupData: GroupData) {
    await this.navigateToCreateGroupPage();
    
    await this.page.getByLabel('Group name*').click();
    await this.page.getByLabel('Group name*').fill(groupData.name);
    await this.page.getByLabel('Group name*').press('Tab');
    
    await this.page.getByLabel('Contact email address*').click();
    await this.page.getByLabel('Contact email address*').fill(groupData.email);
    
    await this.page.getByLabel('Institution*').click();
    await this.page.getByLabel('Institution*').fill(groupData.institution);
    
    await this.page.getByLabel('Address Line 1*').click();
    await this.page.getByLabel('Address Line 1*').fill(groupData.addressLine1);
    
    if (groupData.addressLine2) {
      await this.page.getByLabel('Address Line 2').click();
      await this.page.getByLabel('Address Line 2').fill(groupData.addressLine2);
    }
    
    await this.page.getByLabel('City*').click();
    await this.page.getByLabel('City*').fill(groupData.city);
    
    if (groupData.state) {
      await this.page.getByLabel('State / Province').click();
      await this.page.getByLabel('State / Province').fill(groupData.state);
    }
    
    await this.page.getByLabel('ZIP / Postal code*').click();
    await this.page.getByLabel('ZIP / Postal code*').fill(groupData.zipCode);
    
    await this.page.getByLabel('Country*').selectOption(groupData.country);
    
    await this.page.getByRole('button', { name: 'Create group' }).click();
    
    // Dynamic assertions using the provided groupData
    await expect(this.page.getByRole('cell', { name: groupData.institution })).toBeVisible();
    await expect(this.page.getByRole('cell', { name: groupData.email })).toBeVisible();
    
    // Combine address lines if addressLine2 exists
    const fullAddress = groupData.addressLine2 
      ? `${groupData.addressLine1} ${groupData.addressLine2}`
      : groupData.addressLine1;
    await expect(this.page.getByRole('cell', { name: fullAddress })).toBeVisible();
    
    await expect(this.page.getByRole('heading', { name: groupData.name })).toBeVisible();
  }
}