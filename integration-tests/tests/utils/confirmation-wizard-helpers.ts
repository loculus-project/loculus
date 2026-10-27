import type { Page } from '@playwright/test';

/** Matches the button that advances the submission confirmation wizard, whichever step is shown. */
const WIZARD_NEXT_BUTTON_NAME = /^(Continue under Open terms|Names are correct|Submit)$/;

/**
 * Clicks through the confirmation wizard that opens after 'Upload and proceed to Approval',
 * whichever steps it shows, until it closes. The wizard opens once the metadata has been read,
 * so this first waits for it to appear.
 */
export async function clickThroughConfirmationWizard(page: Page, timeout = 10_000) {
    const nextButton = page.getByRole('button', { name: WIZARD_NEXT_BUTTON_NAME }).first();
    await nextButton.waitFor({ state: 'visible', timeout });
    // isVisible can throw while the page navigates away after the last step
    while (await nextButton.isVisible().catch(() => false)) {
        await nextButton.click();
        // Let the wizard advance to the next step or close before checking again
        await page.waitForTimeout(100);
    }
}
