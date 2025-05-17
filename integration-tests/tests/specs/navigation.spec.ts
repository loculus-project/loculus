import { test } from '../fixtures/auth.fixture';
import { AuthPage } from '../pages/auth.page';
import { NavigationPage } from '../pages/navigation.page';

const dummyOrganismDisplayName = 'Dummy Organism';

const organismIndependentNavigationItems = [
    { link: 'My account', title: 'My account' },
    { link: 'API docs', title: 'API Documentation' },
];

const organismNavigationItems = [
    { link: 'Browse', title: '[Organism] - Browse' },
    { link: 'Submit', title: 'Submission portal' },
    { link: 'My account', title: 'My account' },
];

test.describe('Navigation links', () => {
    test('should navigate to the expected pages', async ({ page, testAccount }) => {
        const authPage = new AuthPage(page);
        const navigation = new NavigationPage(page);

        await authPage.createAccount(testAccount);
        await page.goto('/');

        for (const { link, title } of organismIndependentNavigationItems) {
            await navigation.clickLink(link);
            await navigation.expectTitle(title);
        }

        await navigation.openOrganismNavigation();
        await navigation.clickLink(dummyOrganismDisplayName);
        await navigation.expectTitle(`${dummyOrganismDisplayName} - Browse`);

        for (const { link, title } of organismNavigationItems) {
            await navigation.clickLink(link);
            await navigation.expectTitle(title.replace('[Organism]', dummyOrganismDisplayName));
        }
    });
});
