import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence Preview URL Parameters', () => {
  let searchPage: SearchPage;

  test.beforeEach(async ({ page }) => {
    searchPage = new SearchPage(page);
  });

  test('should store the previewed sequence ID in the URL', async ({ page }) => {
    // Navigate to search page
    await searchPage.ebolaSudan();
    
    // The search page should load with no URL parameters initially
    let urlParams = await searchPage.getUrlParams();
    expect(urlParams.has('selectedSeq')).toBe(false);
    
    // Click on a sequence to open the preview modal
    await searchPage.clickOnSequence(0);
    
    // Wait for the preview modal to be visible
    await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
    
    // Check if the URL now contains the selectedSeq parameter
    urlParams = await searchPage.getUrlParams();
    expect(urlParams.has('selectedSeq')).toBe(true);
    expect(urlParams.get('selectedSeq')).not.toBeNull();
    const selectedSeqId = urlParams.get('selectedSeq');
    
    // Close the preview modal
    await (await searchPage.closePreviewButton()).click();
    
    // Check if the selectedSeq parameter is removed from the URL
    urlParams = await searchPage.getUrlParams();
    expect(urlParams.has('selectedSeq')).toBe(false);
    
    // Manually navigate to the URL with selectedSeq parameter
    const currentUrl = new URL(page.url());
    currentUrl.searchParams.set('selectedSeq', selectedSeqId);
    await page.goto(currentUrl.toString());
    
    // Check if the preview modal is automatically opened with the correct sequence
    await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
  });

  test('should store half-screen state in the URL', async ({ page }) => {
    // Navigate to search page
    await searchPage.ebolaSudan();
    
    // Click on a sequence to open the preview modal
    await searchPage.clickOnSequence(0);
    
    // Wait for the preview modal to be visible
    await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
    
    // Toggle to half-screen mode
    await (await searchPage.toggleHalfScreenButton()).click();
    
    // Check if the URL now contains the halfScreen parameter
    let urlParams = await searchPage.getUrlParams();
    expect(urlParams.has('halfScreen')).toBe(true);
    expect(urlParams.get('halfScreen')).toBe('true');
    
    // Check if the half-screen preview is visible
    await expect(page.locator('[data-testid="half-screen-preview"]')).toBeVisible();
    
    // Toggle back to full screen mode
    await (await searchPage.toggleHalfScreenButton()).click();
    
    // Check if the halfScreen parameter is removed from the URL
    urlParams = await searchPage.getUrlParams();
    expect(urlParams.has('halfScreen')).toBe(false);
    
    // Check if the full screen preview is visible again
    await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
  });

  test('should restore state from URL parameters on page load', async ({ page }) => {
    // Navigate to search page with URL parameters
    await searchPage.ebolaSudan();
    
    // Click on a sequence to open the preview modal and get its ID
    await searchPage.clickOnSequence(0);
    await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
    
    // Get the selected sequence ID from the URL
    const urlParams = await searchPage.getUrlParams();
    const selectedSeqId = urlParams.get('selectedSeq');
    
    // Toggle to half-screen mode
    await (await searchPage.toggleHalfScreenButton()).click();
    
    // Close the preview to reset the state
    await (await searchPage.closePreviewButton()).click();
    
    // Manually navigate to the URL with both parameters
    const currentUrl = new URL(page.url());
    currentUrl.searchParams.set('selectedSeq', selectedSeqId);
    currentUrl.searchParams.set('halfScreen', 'true');
    await page.goto(currentUrl.toString());
    
    // Check if the half-screen preview is automatically opened
    await expect(page.locator('[data-testid="half-screen-preview"]')).toBeVisible();
    
    // Navigate away and then back using browser history
    await page.goto('/');
    await page.goBack();
    
    // Check if the half-screen preview is still open with the correct sequence
    await expect(page.locator('[data-testid="half-screen-preview"]')).toBeVisible();
  });
});