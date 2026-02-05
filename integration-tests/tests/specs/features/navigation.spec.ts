import { test } from '../../fixtures/auth.fixture';
import { NavigationPage } from '../../pages/navigation.page';

const organismName = 'Ebola Sudan';

const organismIndependentNavigationItems = [
    { link: 'My account', title: 'My account' },
    { link: 'API docs', title: 'API documentation' },
];

const organismNavigationItems = [
    { link: 'Browse data', title: '[Organism] - Browse' },
    { link: 'Submit sequences', title: 'Submission portal' },
    { link: 'My account', title: 'My account' },
];

test.describe('Top navigation', () => {
    test('should navigate to the expected pages', async ({ page, authenticatedUser }) => {
        void authenticatedUser;
        const navigation = new NavigationPage(page);

        await navigation.page.goto('/');

        for (const { link, title } of organismIndependentNavigationItems) {
            await navigation.clickLink(link);
            await navigation.expectTitle(title);
        }

        await navigation.openOrganismNavigation();
        await navigation.selectOrganism(organismName);
        await navigation.expectTitle(`${organismName} - Browse`);

        for (const { link, title } of organismNavigationItems) {
            await navigation.clickLink(link);
            await navigation.expectTitle(title.replace('[Organism]', organismName));
        }
    });
});
