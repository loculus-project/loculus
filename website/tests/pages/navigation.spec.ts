import { baseUrl, dummyOrganism, test } from '../e2e.fixture';

const organismIndependentNavigationItems = [
    { link: 'User', title: 'Login' },
    { link: 'About', title: 'About' },
    { link: 'Api documentation', title: 'Api Docs' },
    { link: 'Governance', title: 'Governance' },
    { link: 'Status', title: 'Status' },
];

const organismNavigationItems = [
    { link: 'Search', title: '[Organism] - Browse' },
    { link: 'Submit', title: 'Submit' },
    { link: 'User', title: 'Login' },
    { link: 'Sequence Overview', title: 'Sequences' },
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
