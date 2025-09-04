import { expect, test, type Locator } from '@playwright/test';
import { readonlyGroup } from '../../fixtures/group.fixture';
import { readonlyUser } from '../../fixtures/user.fixture';
import { AuthPage } from '../../pages/auth.page';
import { GroupPage } from '../../pages/group.page';

test.describe('Group page sequence counts', () => {
    test('shows sequence counts and search links for each organism', async ({ page }) => {
        const authPage = new AuthPage(page);
        await authPage.login(readonlyUser.username, readonlyUser.password);

        const groupPage = new GroupPage(page);
        const groupId = await groupPage.getOrCreateGroup(readonlyGroup);

        await page.goto(`/group/${groupId}`);

        await page.waitForLoadState('networkidle');

        const sequencesSection = page
            .locator('div.bg-gray-100')
            .filter({
                has: page.getByRole('heading', { name: /Sequences available in/ }),
            })
            .first();

        const rows = sequencesSection.locator('tbody tr');
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);

        let hasLinks = false;
        let ebolaRow: Locator | null = null;

        for (let i = 0; i < rowCount; i++) {
            const row = rows.nth(i);
            const cells = row.locator('td');
            const cellCount = await cells.count();

            expect(cellCount).toBe(2);

            const organismCell = cells.nth(0);
            const organismName = await organismCell.textContent();
            const countCell = cells.nth(1);
            const countText = await countCell.textContent();

            if (organismName?.includes('Ebola')) {
                ebolaRow = row;
                const count = parseInt(countText?.trim() || '0');
                expect(count).toBeGreaterThan(0);
            }

            const links = countCell.locator('a');
            const linkCount = await links.count();

            if (linkCount > 0) {
                hasLinks = true;
                const firstLink = links.first();
                await expect(firstLink).toBeVisible();
                const href = await firstLink.getAttribute('href');
                expect(href).toContain(`groupId=${groupId}`);
                const linkText = await firstLink.textContent();
                expect(linkText?.trim()).toMatch(/^\d+$/);
            } else {
                expect(countText?.trim()).toBe('0');
            }
        }

        expect(ebolaRow).not.toBeNull();

        expect(hasLinks).toBe(true);

        if (ebolaRow) {
            const ebolaLink = ebolaRow.locator('td').nth(1).locator('a').first();
            await ebolaLink.click();

            await page.waitForURL(new RegExp(`/ebola-sudan/search.*\\?.*groupId=${groupId}`), {
                timeout: 10000,
            });

            const currentUrl = page.url();
            expect(currentUrl).toContain(`groupId=${groupId}`);
            expect(currentUrl).toContain('/ebola-sudan/search');
        }
    });
});
