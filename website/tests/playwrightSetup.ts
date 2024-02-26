import isEqual from 'lodash/isEqual.js';
import sortBy from 'lodash/sortBy.js';

import {
    accessionPrefix,
    createTestGroupIfNotExistent,
    DEFAULT_GROUP_NAME,
    e2eLogger,
    getToken,
    lapisUrl,
    testUser,
    testUserPassword,
} from './e2e.fixture.ts';
import { AccessionTransformer } from './util/accessionTransformer.ts';
import { prepareDataToBe } from './util/prepareDataToBe.ts';
import { LapisClient } from '../src/services/lapisClient.ts';
import { ACCESSION_FIELD, IS_REVOCATION_FIELD, VERSION_FIELD, VERSION_STATUS_FIELD } from '../src/settings.ts';
import { siloVersionStatuses } from '../src/types/lapis.ts';

enum LapisStateBeforeTests {
    NoSequencesInLapis = 'NoSequencesInLapis',
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
            instanceName: 'Test',
            primaryKey: 'doesNotMatter',
            defaultOrderBy: 'neitherDoesThis',
            defaultOrder: 'ascending',
            tableColumns: [],
        },
        e2eLogger,
    );

    const lapisState = await checkLapisState(lapisClient);

    if (lapisState === LapisStateBeforeTests.CorrectSequencesInLapis) {
        e2eLogger.info(
            'Skipping data preparation. ' +
                'NOTE: data preparation has to be done before on an empty LAPIS. Expected data found.',
        );
        return;
    }

    e2eLogger.info('No sequences found in LAPIS. Generate data for tests.');

    e2eLogger.info('preparing data in backend.');
    const data = await prepareDataToBe('approvedForRelease', token);
    const revokedData = await prepareDataToBe('revoked', token);
    const revisedData = await prepareDataToBe('revisedForRelease', token);

    e2eLogger.info(
        'done preparing data in backend: ' +
            data
                .concat(revokedData)
                .concat(revisedData)
                .map((sequence) => sequence.accession)
                .join(', '),
    );

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
    const accessionTransformer = new AccessionTransformer(accessionPrefix);

    const numberOfSequencesInLapisResult = await lapisClient.call('aggregated', {});

    if (numberOfSequencesInLapisResult.isErr() && numberOfSequencesInLapisResult.error.status === 503) {
        return LapisStateBeforeTests.NoSequencesInLapis;
    }

    if (numberOfSequencesInLapisResult._unsafeUnwrap().data[0].count === 0) {
        return LapisStateBeforeTests.NoSequencesInLapis;
    }

    const [singleLatestVersionAccession, revisedAndRevokedAccession, revisedAccession] =
        accessionTransformer.generateCustomIds([1, 11, 21]);

    e2eLogger.info(
        'Checking LAPIS for sequences with accessions: ' +
            singleLatestVersionAccession +
            ', ' +
            revisedAndRevokedAccession +
            ', ' +
            revisedAccession,
    );

    const fields = [ACCESSION_FIELD, VERSION_FIELD, VERSION_STATUS_FIELD, IS_REVOCATION_FIELD];
    const [
        shouldBeLatestVersionResult,
        // When SILO can process revocation_entries, we expect two versions.
        shouldBeTwoVersionsAndOneRevokedResult,
        shouldBeTwoVersionsAndOneRevisedResult,
    ] = await Promise.all([
        lapisClient.call('details', { accession: singleLatestVersionAccession, fields }),
        lapisClient.call('details', { accession: revisedAndRevokedAccession, fields }),
        lapisClient.call('details', { accession: revisedAccession, fields }),
    ]);

    const shouldBeLatestVersionAndNotRevoked = sortBy(shouldBeLatestVersionResult._unsafeUnwrap().data, [
        VERSION_FIELD,
    ]);
    const shouldBeTwoVersionsAndOneRevoked = sortBy(shouldBeTwoVersionsAndOneRevokedResult._unsafeUnwrap().data, [
        VERSION_FIELD,
    ]);
    const shouldBeTwoVersionsAndOneRevised = sortBy(shouldBeTwoVersionsAndOneRevisedResult._unsafeUnwrap().data, [
        VERSION_FIELD,
    ]);

    const expectedLatestVersions = [
        {
            accession: singleLatestVersionAccession,
            version: 1,
            versionStatus: siloVersionStatuses.latestVersion,
            isRevocation: 'false',
        },
    ];

    if (!isEqual(shouldBeLatestVersionAndNotRevoked, expectedLatestVersions)) {
        throw new Error(
            `Unexpected data in LAPIS. Please check the data preparation. Received: ${JSON.stringify(
                shouldBeLatestVersionAndNotRevoked,
            )} Expected: ${JSON.stringify(expectedLatestVersions)}`,
        );
    }

    const expectedRevokedVersions = [
        {
            accession: revisedAndRevokedAccession,
            version: 1,
            versionStatus: siloVersionStatuses.revoked,
            isRevocation: 'false',
        },
        {
            accession: revisedAndRevokedAccession,
            version: 2,
            versionStatus: siloVersionStatuses.latestVersion,
            isRevocation: 'true',
        },
    ];

    if (!isEqual(shouldBeTwoVersionsAndOneRevoked, expectedRevokedVersions)) {
        throw new Error(
            `Unexpected data in LAPIS. Please check the data preparation. Received: ${JSON.stringify(
                shouldBeTwoVersionsAndOneRevoked,
            )} Expected: ${JSON.stringify(expectedRevokedVersions)}`,
        );
    }

    const expectedRevisedVersions = [
        {
            accession: revisedAccession,
            version: 1,
            versionStatus: siloVersionStatuses.revised,
            isRevocation: 'false',
        },
        {
            accession: revisedAccession,
            version: 2,
            versionStatus: siloVersionStatuses.latestVersion,
            isRevocation: 'false',
        },
    ];

    if (!isEqual(sortBy(shouldBeTwoVersionsAndOneRevised, ['version']), expectedRevisedVersions)) {
        throw new Error(
            `Unexpected data in LAPIS. Please check the data preparation. Received: ${JSON.stringify(
                shouldBeTwoVersionsAndOneRevised,
            )} Expected: ${JSON.stringify(expectedRevisedVersions)}`,
        );
    }
    return LapisStateBeforeTests.CorrectSequencesInLapis;
}
