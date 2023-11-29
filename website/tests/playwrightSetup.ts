import { LapisClient } from '../src/services/lapisClient.ts';
import { e2eLogger, getToken, lapisUrl, testUser, testUserPassword } from './e2e.fixture.ts';
import { prepareDataToBe } from './util/prepareDataToBe.ts';

export default async function globalSetupForPlaywright() {
    const lapisClient = LapisClient.create(
        lapisUrl,
        { metadata: [], instanceName: 'Test', primaryKey: 'doesNotMatter', tableColumns: [] },
        e2eLogger,
    );

    const numberOfSequencesInLapis = (await lapisClient.call('aggregated', {}))._unsafeUnwrap().data[0].count;

    e2eLogger.info(numberOfSequencesInLapis + ' sequences in LAPIS.');
    if (numberOfSequencesInLapis > 0) {
        return;
    }

    e2eLogger.info('preparing data in backend.');
    const data = await prepareDataToBe(
        'approvedForRelease',
        (await getToken(testUser, testUserPassword)).access_token!,
    );
    e2eLogger.info('done preparing data in backend: ' + data.map((sequence) => sequence.accession).join(', '));

    for (const _ of Array(12)) {
        e2eLogger.info('waiting for sequences in LAPIS...');
        await waitSeconds(10);
        const numberOfSequencesInLapisAfterPreprocessing = (await lapisClient.call('aggregated', {}))._unsafeUnwrap()
            .data[0].count;
        e2eLogger.info('Found ' + numberOfSequencesInLapisAfterPreprocessing + ' sequences in LAPIS.');
        if (numberOfSequencesInLapisAfterPreprocessing > 0) {
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
