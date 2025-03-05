import { Page } from '@playwright/test';

export class SingleSequenceSubmissionPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to the Ebola Sudan submission page
   */
  async navigateToSubmissionPage() {
    await this.page.getByRole('link', { name: 'Submit' }).click();
    await this.page.getByRole('link', { name: 'Ebola Sudan' }).click();
    await this.page.getByRole('link', { name: 'Submit Upload new sequences.' }).click();
    await this.page.getByRole('link', { name: 'Submit single sequence' }).click();
  }

  /**
   * Fill the submission form with the provided data
   */
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


  /**
   * Accept the terms and conditions
   */
  async acceptTerms() {
    await this.page.getByText('I confirm that the data').click();
    await this.page.getByText('I confirm I have not and will').click();
  }

  /**
   * Submit the sequence
   */
  async submitSequence() {
    await this.page.getByRole('button', { name: 'Submit sequences' }).click();
  }

  /**
   * Complete the entire submission process in one go
   */
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