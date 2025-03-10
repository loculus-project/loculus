import { Page } from '@playwright/test';

export class SearchPage {
    constructor(private page: Page) {}

    private async navigateToVirus(virus: string) {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: new RegExp(virus) }).click();
        await this.page.waitForFunction(() => (window as any).SearchFullUIHydrated);
    }

    async ebolaSudan() {
        await this.navigateToVirus('Ebola Sudan');
    }

    async select(fieldLabel: string, option: string) {
        await this.page.locator('label').filter({ hasText: fieldLabel }).click();
        await this.page.getByRole('option', { name: new RegExp(option) }).click();
    }

    async enterMutation(mutation: string) {
        await this.page.getByPlaceholder('Mutations').click();
        await this.page.getByLabel('Mutations').fill(mutation);
        await this.page.getByRole('option', { name: mutation }).click();
    }

    async enterAccessions(accessions: string) {
        await this.page.getByLabel('Accession').click();
        await this.page.getByLabel('Accession').fill(accessions);
    }

    async resetSearchForm() {
        await this.page.getByRole('button', { name: 'reset' }).click();
    }
}
