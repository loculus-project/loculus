import { baseUrl, dummyOrganism, test } from '../e2e.fixture';

const organismIndependentNavigationItems = [
    { link: 'My account', title: 'My account' },
    { link: 'API docs', title: 'API Documentation' },
    { link: 'Governance', title: 'Governance' },
    { link: 'Status', title: 'Status' },
];

const organismNavigationItems = [
    { link: 'Browse', title: '[Organism] - Browse' },
    { link: 'Submit', title: 'Submission portal' },
    { link: 'My account', title: 'My account' },
];

test.describe('Clicking the navigation links', () => {
    test('should navigate to the expected pages', async ({ loginAsTestUser, navigationFixture }) => {
        await loginAsTestUser();

        await navigationFixture.page.goto(baseUrl);

        for (const { link, title } of organismIndependentNavigationItems) {
            await navigationFixture.clickLink(link);
            await navigationFixture.expectTitle(title);
        }

        await navigationFixture.openOrganismNavigation();
        await navigationFixture.clickLink(dummyOrganism.displayName);
        await navigationFixture.expectTitle(`${dummyOrganism.displayName} - Browse`);

        for (const { link, title } of organismNavigationItems) {
            await navigationFixture.clickLink(link);
            await navigationFixture.expectTitle(title.replace('[Organism]', dummyOrganism.displayName));
        }
    });
});
