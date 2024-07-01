import {
    backendUrl,
    createTestGroupIfNotExistent,
    DEFAULT_GROUP,
    DEFAULT_GROUP_NAME,
    e2eLogger,
    getToken,
    lapisUrl,
    testUser,
    testUserPassword,
} from './e2e.fixture.ts';
import { prepareDataToBe } from './util/prepareDataToBe.ts';
import { getTestSequences, setTestSequences } from './util/testSequenceProvider.ts';
import { GroupManagementClient } from '../src/services/groupManagementClient.ts';
import { LapisClient } from '../src/services/lapisClient.ts';
import type { AccessionVersion } from '../src/types/backend.ts';

enum LapisStateBeforeTests {
    NotCorrectSequencesInLapis = 'NotCorrectSequencesInLapis',
    CorrectSequencesInLapis = 'CorrectSequencesInLapis',
}

export default async function globalSetupForPlaywright() {
    const secondsToWait = 10;
    const maxNumberOfRetries = 24;

    e2eLogger.info(
        'Setting up E2E tests. In order to test search results, data will be prepared in LAPIS. ' +
            'This preparation may take a few minutes and is done before to allow faster testing of search results.',
    );
    e2eLogger.info(`Setup ${DEFAULT_GROUP_NAME}. Logging in as '${testUser}' to create the group.`);
    const token = (await getToken(testUser, testUserPassword)).accessToken;

    await createTestGroupIfNotExistent(token);

    const lapisClient = LapisClient.create(
        lapisUrl,
        {
            metadata: [],
            organismName: 'Test',
            primaryKey: 'doesNotMatter',
            defaultOrderBy: 'neitherDoesThis',
            defaultOrder: 'ascending',
            tableColumns: [],
            inputFields: [],
        },
        e2eLogger,
    );
    const groupManagementClient = GroupManagementClient.create(backendUrl, e2eLogger);

    const lapisState = await checkLapisState(lapisClient);

    if (lapisState === LapisStateBeforeTests.CorrectSequencesInLapis) {
        const testSequences = getTestSequences();
        e2eLogger.info('Skipping data preparation. Expected data found. ' + JSON.stringify(testSequences));
        return;
    }

    e2eLogger.info('No sequences found in LAPIS. Generate data for tests.');

    e2eLogger.info('preparing data in backend.');
    const groupId = await groupManagementClient
        .createGroup(token, DEFAULT_GROUP)
        .then((result) => result._unsafeUnwrap().groupId);
    e2eLogger.info('created group with id ' + groupId);
    const data = await prepareDataToBe('approvedForRelease', token, groupId);
    const revokedData = await prepareDataToBe('revoked', token, groupId);
    const revisedData = await prepareDataToBe('revisedForRelease', token, groupId);

    e2eLogger.info(
        'done preparing data in backend: ' +
            data
                .concat(revokedData)
                .concat(revisedData)
                .map((sequence) => sequence.accession)
                .join(', '),
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of Array(maxNumberOfRetries)) {
        e2eLogger.info('waiting for sequences in LAPIS...');
        await waitSeconds(secondsToWait);
        const lapisState = await checkLapisState(lapisClient);
        e2eLogger.info('Lapis is in state ' + lapisState);
        if (lapisState === LapisStateBeforeTests.CorrectSequencesInLapis) {
            e2eLogger.info('starting tests.');
            return;
        }
    }
    throw new Error('No sequences in Lapis found - aborting tests.');
}

function waitSeconds(seconds: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, seconds * 1000);
    });
}

async function checkLapisState(lapisClient: LapisClient): Promise<LapisStateBeforeTests> {
    const numberOfSequencesInLapisResult = await lapisClient.call('aggregated', {});

    if (numberOfSequencesInLapisResult.isErr() && (numberOfSequencesInLapisResult.error.status === 503
                                                   ||  numberOfSequencesInLapisResult.error.status === 404
                                                   )
                                                  
                                                  ) {
        return LapisStateBeforeTests.NotCorrectSequencesInLapis;
    }

    if (numberOfSequencesInLapisResult._unsafeUnwrap().data[0].count === 0) {
        return LapisStateBeforeTests.NotCorrectSequencesInLapis;
    }

    const latestVersionWithoutRevisions = await getLatestVersionWithoutRevisions(lapisClient);

    if (latestVersionWithoutRevisions === undefined) {
        e2eLogger.error('latestVersionWithoutRevisions is undefined');
        return LapisStateBeforeTests.NotCorrectSequencesInLapis;
    }

    const testSequenceEntry = {
        accession: `${latestVersionWithoutRevisions.accession}`,
        version: 1,
    };

    const revocationEntryAsLatestVersion = await getRevocationEntryAsLatestVersion(lapisClient);

    if (revocationEntryAsLatestVersion === undefined) {
        e2eLogger.error('revocationEntryAsLatestVersion is undefined');
        return LapisStateBeforeTests.NotCorrectSequencesInLapis;
    }

    const revocationSequenceEntry = revocationEntryAsLatestVersion;
    const revokedSequenceEntry = {
        accession: `${revocationEntryAsLatestVersion.accession}`,
        version: 1,
    };

    const revisedEntryAsLatestVersionWhichIsSecondVersion = await getRevisedEntryAsLatestVersion(lapisClient);

    if (revisedEntryAsLatestVersionWhichIsSecondVersion === undefined) {
        e2eLogger.error('revisedEntryAsLatestVersionWhichIsVersion2 is undefined');
        return LapisStateBeforeTests.NotCorrectSequencesInLapis;
    }

    const revisedSequenceEntry = revisedEntryAsLatestVersionWhichIsSecondVersion;
    const deprecatedSequenceEntry = {
        accession: `${revisedEntryAsLatestVersionWhichIsSecondVersion.accession}`,
        version: 1,
    };

    setTestSequences({
        testSequenceEntry,
        revokedSequenceEntry,
        revocationSequenceEntry,
        deprecatedSequenceEntry,
        revisedSequenceEntry,
    });

    return LapisStateBeforeTests.CorrectSequencesInLapis;
}

async function getLatestVersionWithoutRevisions(lapisClient: LapisClient) {
    const result = await lapisClient.call('details', {
        versionTo: 1,
        isRevocation: 'false',
        limit: 1,
        versionStatus: 'LATEST_VERSION',
        fields: ['accession', 'version'],
    });
    return result._unsafeUnwrap().data[0] as AccessionVersion | undefined;
}

async function getRevocationEntryAsLatestVersion(lapisClient: LapisClient) {
    const result = await lapisClient.call('details', {
        isRevocation: 'true',
        version: 2,
        limit: 1,
        versionStatus: 'LATEST_VERSION',
        fields: ['accession', 'version'],
    });
    return result._unsafeUnwrap().data[0] as AccessionVersion | undefined;
}

async function getRevisedEntryAsLatestVersion(lapisClient: LapisClient) {
    const result = await lapisClient.call('details', {
        isRevocation: 'false',
        version: 2,
        limit: 1,
        versionStatus: 'LATEST_VERSION',
        fields: ['accession', 'version'],
    });
    return result._unsafeUnwrap().data[0] as AccessionVersion | undefined;
}
