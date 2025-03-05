import { Page } from '@playwright/test';

export class SingleSequenceSubmissionPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }


  async navigateToSubmissionPage() {
    await this.page.getByRole('link', { name: 'Submit' }).click();
    await this.page.getByRole('link', { name: 'Ebola Sudan' }).click();
    await this.page.getByRole('link', { name: 'Submit Upload new sequences.' }).click();
    await this.page.getByRole('link', { name: 'Submit single sequence' }).click();
  }


  async fillSubmissionForm({
    submissionId,
    collectionCountry,
    collectionDate,
    authorAffiliations,
  }: {
    submissionId: string;
    collectionCountry: string;
    collectionDate: string;
    authorAffiliations: string;
  }) {
    await this.page.getByLabel('Submission ID:').fill(submissionId);
    await this.page.getByLabel('Collection country:').fill(collectionCountry);
    await this.page.getByLabel('Collection date:').fill(collectionDate);
    await this.page.getByLabel('Author affiliations:').fill(authorAffiliations);
  }

acceptTerms() {
    await this.page.getByText('I confirm that the data').click();
    await this.page.getByText('I confirm I have not and will').click();
  }

 
  async submitSequence() {
    await this.page.getByRole('button', { name: 'Submit sequences' }).click();
  }

 
  async completeSubmission({
    submissionId,
    collectionCountry,
    collectionDate,
    authorAffiliations,
  }: {
    submissionId: string;
    collectionCountry: string;
    collectionDate: string;
    authorAffiliations: string;
  }) {
    await this.navigateToSubmissionPage();
    await this.fillSubmissionForm({
      submissionId,
      collectionCountry,
      collectionDate,
      authorAffiliations,
    });
    await this.acceptTerms();
    await this.submitSequence();
  }
}