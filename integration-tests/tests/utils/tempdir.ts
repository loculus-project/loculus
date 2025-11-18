import fs from 'fs';
import path from 'path';

export async function clearTempDir(tempDir: string) {
    // Clean entire tempdir to ensure fresh state
    const entries = await fs.promises.readdir(tempDir);
    await Promise.all(
        entries.map((entry) =>
            fs.promises.rm(path.join(tempDir, entry), { recursive: true, force: true }),
        ),
    );
}
