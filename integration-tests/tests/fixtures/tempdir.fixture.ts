import { test as groupTest } from './group.fixture';
import fs from 'fs';
import path from 'path';
import os from 'os';

type TempDirFixtures = {
    /**
     * A temporary directory that is automatically created before the test
     * and cleaned up after the test completes.
     */
    tempDir: string;
};

export const test = groupTest.extend<TempDirFixtures>({
    tempDir: async ({}, use) => {
        const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'playwright-upload-'));
        try {
            await use(tmpDir);
        } finally {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        }
    },
});
