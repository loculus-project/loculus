import { expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { clearTmpDir } from './tmpdir';

/**
 * @param fileContents Struct containing possible mixture of:
 *                      filename -> filecontent, or
 *                      subfolder -> filename -> filecontent
 * @param tmpDir The temporary directory to use for storing files
 */
export async function prepareTmpDirForBulkUpload(
    fileContents: Record<string, string | Record<string, string>>,
    tmpDir: string,
) {
    await clearTmpDir(tmpDir);

    // Create subfolders if required
    await Promise.all(
        Object.entries(fileContents).flatMap(([p, f]) => {
            if (typeof f !== 'string') return fs.promises.mkdir(path.join(tmpDir, p));
        }),
    );
    // Populate files, in subfolders if required
    await Promise.all(
        Object.entries(fileContents).flatMap(([p, f]) => {
            if (typeof f !== 'string')
                return Object.entries(f).map(([fileName, fileContent]) =>
                    fs.promises.writeFile(path.join(tmpDir, p, fileName), fileContent),
                );
            else return fs.promises.writeFile(path.join(tmpDir, p), f);
        }),
    );
}

/**
 * @param fileContents A struct: filename -> filecontent
 * @param tmpDir The temporary directory to use for storing files
 */
export async function prepareTmpDirForSingleUpload(
    fileContents: Record<string, string>,
    tmpDir: string,
) {
    await clearTmpDir(tmpDir);

    await Promise.all(
        Object.entries(fileContents).map(([fileName, fileContent]) =>
            fs.promises.writeFile(path.join(tmpDir, fileName), fileContent),
        ),
    );
}

export async function uploadFilesFromTmpDir(
    page: Page,
    fileCategory: string,
    tmpDir: string,
    fileCount: number,
    timeout = 30_000,
) {
    await page.getByRole('heading', { name: 'Extra files' }).scrollIntoViewIfNeeded();
    await Promise.all([
        page.getByTestId(fileCategory).setInputFiles(tmpDir),
        expect(
            page.getByTestId(new RegExp(`^status_${fileCategory}_`)).filter({ hasText: '✓' }),
        ).toHaveCount(fileCount, { timeout }),
        // Enabled only while the category is 'uploadCompleted', which is what submitting requires.
        expect(page.getByTestId(`add_button_${fileCategory}`)).toBeEnabled({ timeout }),
    ]);
}
