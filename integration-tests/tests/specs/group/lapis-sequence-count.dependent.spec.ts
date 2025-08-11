import { expect, test, type Locator } from '@playwright/test';
import { readonlyGroup } from '../../fixtures/group.fixture';
import { readonlyUser } from '../../fixtures/user.fixture';
import { AuthPage } from '../../pages/auth.page';
import { GroupPage } from '../../pages/group.page';

// Verify that group details page shows per-organism LAPIS sequence counts with search links
// This test depends on the readonly setup which creates a group with at least one Ebola sequence

test.describe('Group page sequence counts', () => {
    test('shows sequence counts and search links for each organism', async ({ page }) => {
        // Login as the readonly user
        const authPage = new AuthPage(page);
        await authPage.login(readonlyUser.username, readonlyUser.password);

        // Get the readonly group ID
        const groupPage = new GroupPage(page);
        const groupId = await groupPage.getOrCreateGroup(readonlyGroup);

        // Navigate to the group page
        await page.goto(`/group/${groupId}`);

        // Wait for the page to load
        await page.waitForLoadState('networkidle');

        // Check if we're on the group page - look for the readonly group name
        const groupPageIndicator = page
            .locator('h1, h2')
            .filter({
                hasText: new RegExp(readonlyGroup.name + '|Users|Edit group'),
            })
            .first();
        await expect(groupPageIndicator).toBeVisible({ timeout: 10000 });

        // Scroll down to see if the sequences section is below the fold
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500); // Wait for any lazy loading

        // Find the sequences section
        const sequencesHeading = page.getByRole('heading', { name: /Sequences available in/ });
        await expect(sequencesHeading).toBeVisible();

        const usersHeading = page.getByRole('heading', { name: 'Users' });
        await expect(usersHeading).toBeVisible();

        const usersBox = await usersHeading.boundingBox();
        const seqBox = await sequencesHeading.boundingBox();
        expect(usersBox && seqBox).not.toBeNull();
        if (usersBox && seqBox) {
            expect(seqBox.y).toBeGreaterThan(usersBox.y);
        }

        // Find the sequences section - it's in a gray box with the heading
        const sequencesSection = page
            .locator('div.bg-gray-100')
            .filter({
                has: page.getByRole('heading', { name: /Sequences available in/ }),
            })
            .first();

        // Within that section, find the table rows
        const rows = sequencesSection.locator('tbody tr');
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);

        // Check each organism row
        let hasLinks = false;
        let ebolaRow: Locator | null = null;

        for (let i = 0; i < rowCount; i++) {
            const row = rows.nth(i);
            const cells = row.locator('td');
            const cellCount = await cells.count();

            // Should have 2 cells: organism name and count
            expect(cellCount).toBe(2);

            const organismCell = cells.nth(0);
            const organismName = await organismCell.textContent();
            const countCell = cells.nth(1);
            const countText = await countCell.textContent();

            // Check if this is the Ebola row
            if (organismName?.includes('Ebola')) {
                ebolaRow = row;
                // Ebola should have at least 1 sequence from the readonly setup
                const count = parseInt(countText?.trim() || '0');
                expect(count).toBeGreaterThan(0);
            }

            // Check if there's a link in the count cell
            const links = countCell.locator('a');
            const linkCount = await links.count();

            if (linkCount > 0) {
                hasLinks = true;
                const firstLink = links.first();
                await expect(firstLink).toBeVisible();
                const href = await firstLink.getAttribute('href');
                expect(href).toContain(`groupId=${groupId}`);

                // The link text should be a number
                const linkText = await firstLink.textContent();
                expect(linkText?.trim()).toMatch(/^\d+$/);
            } else {
                // If no link, the count should be "0" (displayed as plain text)
                expect(countText?.trim()).toBe('0');
            }
        }

        // We should have found the Ebola row
        expect(ebolaRow).not.toBeNull();

        // We should have found at least one link (for Ebola)
        expect(hasLinks).toBe(true);

        // Click on the Ebola link to navigate to search page
        if (ebolaRow) {
            const ebolaLink = ebolaRow.locator('td').nth(1).locator('a').first();
            await ebolaLink.click();

            // Wait for navigation to the search page with the group filter
            await page.waitForURL(new RegExp(`/ebola-sudan/search.*\\?.*groupId=${groupId}`), {
                timeout: 10000,
            });

            // Verify the URL contains the expected group ID parameter
            const currentUrl = page.url();
            expect(currentUrl).toContain(`groupId=${groupId}`);
            expect(currentUrl).toContain('/ebola-sudan/search');
        }
    });
});
