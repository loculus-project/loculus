import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';

// Verify that group details page shows per-organism LAPIS sequence counts with search links

test.describe('Group page sequence counts', () => {
    test('shows sequence counts and search links for each organism', async ({ pageWithGroup, groupId }) => {
        const section = pageWithGroup.locator('div:has(h2:has-text("Sequences available in"))');
        const sequencesHeading = section.getByRole('heading', { name: /Sequences available in/ });
        await expect(sequencesHeading).toBeVisible();

        const usersHeading = pageWithGroup.getByRole('heading', { name: 'Users' });
        await expect(usersHeading).toBeVisible();

        const usersBox = await usersHeading.boundingBox();
        const seqBox = await sequencesHeading.boundingBox();
        expect(usersBox && seqBox).not.toBeNull();
        if (usersBox && seqBox) {
            expect(seqBox.y).toBeGreaterThan(usersBox.y);
        }

        const rows = section.locator('tbody tr');
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);

        for (let i = 0; i < rowCount; i++) {
            const link = rows.nth(i).getByRole('link');
            await expect(link).toBeVisible();
            await expect(link).toHaveAttribute('href', new RegExp(`\\?groupId=${groupId}`));
        }

        await rows.nth(0).getByRole('link').click();
        await pageWithGroup.waitForURL(new RegExp(`/search/.*\\?groupId=${groupId}`));
    });
});
