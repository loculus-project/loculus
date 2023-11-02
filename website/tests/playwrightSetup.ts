import { LapisClient } from '../src/services/lapisClient.ts';
import { backendClient, e2eLogger, lapisUrl } from './e2e.fixture.ts';
import { prepareDataToBe } from './util/prepareDataToBe.ts';
import fs from 'fs';
import util from 'node:util';
import { exec as execCb } from 'child_process';

const exec = util.promisify(execCb);

export default async function globalSetupForPlaywright() {
    const lapisClient = LapisClient.create(
        lapisUrl,
        {
            schema: { metadata: [], instanceName: 'Test', primaryKey: 'doesNotMatter', tableColumns: [] },
        },
        e2eLogger,
    );

    const numberOfSequencesInLapis = (await lapisClient.call('aggregated', {}))._unsafeUnwrap().data[0].count;

    e2eLogger.info(numberOfSequencesInLapis + ' sequences in LAPIS.');
    if (numberOfSequencesInLapis > 0) {
        return;
    }

    await prepareDataToBe('releasable');
    const releasedData = (await backendClient.call('getReleasedData'))._unsafeUnwrap();
    fs.writeFileSync('./tests/testData/siloPreprocessing/input.ndjson', releasedData);

    const { stdout, stderr } = await exec('docker compose -f ../docker-compose-silo-preprocessing.yml up');

    e2eLogger.info('SILO preprocessing stdout: ' + stdout);
    e2eLogger.info('SILO preprocessing stderr: ' + stderr);

    for (const _ of Array(3)) {
        e2eLogger.info('waiting...');
        await new Promise((resolve) => {
            setTimeout(resolve, 10000);
        });
        const numberOfSequencesInLapisAfterPreprocessing = (await lapisClient.call('aggregated', {}))._unsafeUnwrap()
            .data[0].count;
        e2eLogger.info(
            'Found ' + numberOfSequencesInLapisAfterPreprocessing + ' sequences in LAPIS after preprocessing.',
        );
        if (numberOfSequencesInLapisAfterPreprocessing > 0) {
            return;
        }
    }
    throw new Error('No sequences in Lapis found - aborting tests.');
}
