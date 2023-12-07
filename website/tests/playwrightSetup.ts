import isEqual from 'lodash/isEqual.js';
import sortBy from 'lodash/sortBy.js';

import { e2eLogger, getToken, lapisUrl, testUser, testUserPassword } from './e2e.fixture.ts';
import { prepareDataToBe } from './util/prepareDataToBe.ts';
import { LapisClient, siloVersionStatuses } from '../src/services/lapisClient.ts';

enum LapisStateBeforeTests {
    NoSequencesInLapis = 'NoSequencesInLapis',
    CorrectSequencesInLapis = 'CorrectSequencesInLapis',
}

export default async function globalSetupForPlaywright() {
    const secondsToWait = 10;
    const maxNumberOfRetries = 12;

    const lapisClient = LapisClient.create(
        lapisUrl,
        { metadata: [], instanceName: 'Test', primaryKey: 'doesNotMatter', tableColumns: [] },
        e2eLogger,
    );

    const lapisState = await checkLapisState(lapisClient);

    if (lapisState === LapisStateBeforeTests.CorrectSequencesInLapis) {
        e2eLogger.info(
            'Skipping data preparation. NOTE: data preparation have to be done before on an empty LAPIS. Expected data found.',
        );
        return;
    }

    e2eLogger.info('No sequences found in LAPIS. Generate data for tests.');

    e2eLogger.info(`logging in as '${testUser}'.`);
    const token = (await getToken(testUser, testUserPassword)).accessToken;

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
        const numberOfSequencesInLapisAfterPreprocessing = (await lapisClient.call('aggregated', {}))._unsafeUnwrap()
            .data[0].count;
        e2eLogger.info('Found ' + numberOfSequencesInLapisAfterPreprocessing + ' sequences in LAPIS.');
        if (numberOfSequencesInLapisAfterPreprocessing >= 30) {
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
    const numberOfSequencesInLapis = (await lapisClient.call('aggregated', {}))._unsafeUnwrap().data[0].count;
    if (numberOfSequencesInLapis === 0) {
        return LapisStateBeforeTests.NoSequencesInLapis;
    }

    const fields = ['accession', 'version', 'versionStatus', 'isRevocation'];
    const [
        shouldBeLatestVersionResult,
        // When SILO can process revocation_entries, we expect two versions.
        shouldBeTwoVersionsAndOneRevokedResult,
        shouldBeTwoVersionsAndOneRevisedResult,
    ] = await Promise.all([
        lapisClient.call('details', { accession: '1', fields }),
        lapisClient.call('details', { accession: '11', fields }),
        lapisClient.call('details', { accession: '21', fields }),
    ]);

    const shouldBeLatestVersionAndNotRevoked = sortBy(shouldBeLatestVersionResult._unsafeUnwrap().data, ['version']);
    const shouldBeTwoVersionsAndOneRevoked = sortBy(shouldBeTwoVersionsAndOneRevokedResult._unsafeUnwrap().data, [
        'version',
    ]);
    const shouldBeTwoVersionsAndOneRevised = sortBy(shouldBeTwoVersionsAndOneRevisedResult._unsafeUnwrap().data, [
        'version',
    ]);

    const expectedLatestVersion = sortBy(
        [
            {
                accession: '1',
                version: 1,
                versionStatus: siloVersionStatuses.latestVersion,
                isRevocation: 'false',
            },
        ],
        ['version'],
    );

    if (isEqual(shouldBeLatestVersionAndNotRevoked, expectedLatestVersion) === false) {
        throw new Error(
            `Unexpected data in LAPIS. Please check the data preparation. Received: ${JSON.stringify(
                shouldBeLatestVersionAndNotRevoked,
            )} Expected: ${JSON.stringify(expectedLatestVersion)}`,
        );
    }

    const expectedRevokedVersion = sortBy(
        [
            {
                accession: '11',
                version: 1,
                versionStatus: siloVersionStatuses.revoked,
                isRevocation: 'false',
            },
        ],
        ['version'],
    );

    if (isEqual(shouldBeTwoVersionsAndOneRevoked, expectedRevokedVersion) === false) {
        throw new Error(
            `Unexpected data in LAPIS. Please check the data preparation. Received: ${JSON.stringify(
                shouldBeTwoVersionsAndOneRevoked,
            )} Expected: ${JSON.stringify(expectedRevokedVersion)}`,
        );
    }

    const expectedRevisedVersion = sortBy(
        [
            {
                accession: '21',
                version: 1,
                versionStatus: siloVersionStatuses.revised,
                isRevocation: 'false',
            },
            {
                accession: '21',
                version: 2,
                versionStatus: siloVersionStatuses.latestVersion,
                isRevocation: 'false',
            },
        ],
        ['version'],
    );

    if (isEqual(sortBy(shouldBeTwoVersionsAndOneRevised, ['version']), expectedRevisedVersion) === false) {
        throw new Error(
            `Unexpected data in LAPIS. Please check the data preparation. Received: ${JSON.stringify(
                shouldBeTwoVersionsAndOneRevised,
            )} Expected: ${JSON.stringify(expectedRevisedVersion)}`,
        );
    }
    return LapisStateBeforeTests.CorrectSequencesInLapis;
}
