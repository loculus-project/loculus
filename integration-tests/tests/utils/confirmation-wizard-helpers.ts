import type { Page } from '@playwright/test';

/** The wizard's final button has the same name as the page's Upload button, so buttons are looked up inside it. */
export const confirmationWizard = (page: Page) =>
    page.getByRole('dialog', { name: 'Confirm submission' });

/**
 * Clicks through the confirmation wizard that opens after clicking 'Upload' on the submit or revise page.
 * The open data use terms and author names steps are optional and come in that order; the final step's
 * 'Upload' button is always present and sends the data.
 */
export async function clickThroughConfirmationWizard(page: Page, timeout = 10_000) {
    const dialog = confirmationWizard(page);
    await dialog.waitFor({ state: 'visible', timeout });

    for (const optionalStepButtonName of ['Continue under Open terms', 'Names are correct']) {
        const button = dialog.getByRole('button', { name: optionalStepButtonName, exact: true });
        if (await button.isVisible()) {
            await button.click();
            await button.waitFor({ state: 'hidden' });
        }
    }

    await dialog.getByRole('button', { name: 'Upload', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout });
}
