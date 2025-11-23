import fs from 'fs';
import path from 'path';

export async function clearTmpDir(tmpDir: string) {
    const entries = await fs.promises.readdir(tmpDir);
    await Promise.all(
        entries.map((entry) =>
            fs.promises.rm(path.join(tmpDir, entry), { recursive: true, force: true }),
        ),
    );
}
