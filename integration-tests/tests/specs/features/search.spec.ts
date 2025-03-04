import { expect, test } from '@playwright/test';

test.describe('Search', () => {
    test('test that filter can be removed by clicking the X', async ({ page }) => {
        test.setTimeout(60000);
        await page.goto('/ebola-sudan/search?geoLocCountry=Canada');
        await expect(page.getByText('Collection country:Canada')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText('Collection country:Canada')).not.toBeVisible();
        await expect(page.getByLabel('Collection country')).toBeEmpty();
        await expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('test that mutation filter can be removed by clicking the X', async ({ page }) => {
        test.setTimeout(60000);
        await page.goto('/ebola-sudan/search?mutation=A23T');
        await expect(page.getByText('nucleotideMutations:A23T')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText('nucleotideMutations:A23T')).not.toBeVisible();
        await expect(page.getByLabel('Collection country')).toBeEmpty();
        await expect(new URL(page.url()).searchParams.size).toBe(0);
    });
});