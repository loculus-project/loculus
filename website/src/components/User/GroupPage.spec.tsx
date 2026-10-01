import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';

import { GroupPage } from './GroupPage';
import {
    testAccessToken,
    testConfig,
    testDatabaseName,
    testGroups,
    testOrganism,
    testServer,
    testUser,
} from '../../../vitest.setup';

const DUMMY_GROUP_DETAILS = {
    group: testGroups[0],
    users: [testUser],
};

describe('GroupPage', () => {
    test('test authenticated can edit view', () => {
        render(
            <GroupPage
                prefetchedGroupDetails={DUMMY_GROUP_DETAILS}
                clientConfig={testConfig.public}
                accessToken={testAccessToken}
                username={testUser.name}
                userGroups={testGroups}
                organisms={[]}
                databaseName={testDatabaseName}
                loginUrl=''
                dateFieldForGroupGraph={null}
            />,
        );

        const targetString = `to ${testDatabaseName} see full group details`;
        expect(screen.queryByText(targetString)).toBeNull();
        expect(screen.getByText(testGroups[0].contactEmail!)).toBeVisible();
        expect(screen.getByRole('heading', { name: `Sequences available in ${testDatabaseName}` })).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Users' })).toBeVisible();
    });

    test('test authenticated cannot edit view', () => {
        render(
            <GroupPage
                prefetchedGroupDetails={DUMMY_GROUP_DETAILS}
                clientConfig={testConfig.public}
                accessToken={testAccessToken}
                username={testUser.name}
                userGroups={[]}
                organisms={[]}
                databaseName={testDatabaseName}
                loginUrl=''
                dateFieldForGroupGraph={null}
            />,
        );

        const targetString = `to ${testDatabaseName} see full group details`;
        expect(screen.queryByText(targetString)).toBeNull();
        expect(screen.getByText(testGroups[0].contactEmail!)).toBeVisible();
        expect(screen.getByRole('heading', { name: `Sequences available in ${testDatabaseName}` })).toBeVisible();
        expect(screen.queryByRole('heading', { name: /users/i })).toBeNull();
    });

    test('test unauthenticated view', () => {
        render(
            <GroupPage
                prefetchedGroupDetails={DUMMY_GROUP_DETAILS}
                clientConfig={testConfig.public}
                accessToken=''
                username=''
                userGroups={[]}
                organisms={[]}
                databaseName={testDatabaseName}
                loginUrl=''
                dateFieldForGroupGraph={null}
            />,
        );

        const targetString = `to ${testDatabaseName} to see contact details for the group.`;
        expect(screen.queryByText(targetString)).toBeVisible();
        expect(screen.queryByText(testGroups[0].contactEmail!)).toBeNull();
        expect(screen.getByRole('heading', { name: `Sequences available in ${testDatabaseName}` })).toBeVisible();
        expect(screen.queryByRole('heading', { name: /users/i })).toBeNull();
    });

    test('fetches the per-organism sequence count as a GET', async () => {
        const requests: string[] = [];
        testServer.use(
            http.all('http://lapis.dummy/sample/aggregated', ({ request }) => {
                requests.push(`${request.method} ${request.url}`);
                return HttpResponse.json({ data: [{ count: 4242 }], info: {} });
            }),
        );

        render(
            <GroupPage
                prefetchedGroupDetails={DUMMY_GROUP_DETAILS}
                clientConfig={testConfig.public}
                accessToken=''
                username=''
                userGroups={[]}
                organisms={[{ key: testOrganism, displayName: 'Test organism' }]}
                databaseName={testDatabaseName}
                loginUrl=''
                dateFieldForGroupGraph={null}
            />,
        );

        expect(await screen.findByText('4242')).toBeVisible();
        expect(requests).toEqual([
            `GET http://lapis.dummy/sample/aggregated?groupId=${testGroups[0].groupId}&versionStatus=LATEST_VERSION&isRevocation=false`,
        ]);
    });
});
