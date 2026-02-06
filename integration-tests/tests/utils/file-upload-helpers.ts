import { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { clearTmpDir } from './tmpdir';

/**
 * @param fileContents A struct: submissionID -> filename -> filecontent
 * @param tmpDir The temporary directory to use for storing files
 */
export async function prepareTmpDirForBulkUpload(
    fileContents: Record<string, Record<string, string>>,
    tmpDir: string,
) {
    await clearTmpDir(tmpDir);

    // Create submission directories and write files
    const submissionIds = Object.keys(fileContents);
    await Promise.all(
        submissionIds.map((submissionId) => fs.promises.mkdir(path.join(tmpDir, submissionId))),
    );
    await Promise.all(
        Object.entries(fileContents).flatMap(([submissionId, files]) => {
            return Object.entries(files).map(([fileName, fileContent]) =>
                fs.promises.writeFile(path.join(tmpDir, submissionId, fileName), fileContent),
            );
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
    testId: string,
    tmpDir: string,
    fileCount: number,
) {
    await page.getByRole('heading', { name: 'Extra files' }).scrollIntoViewIfNeeded();
    // Trigger file upload (don't await) and wait for checkmarks to appear (indicates success)
    void page.getByTestId(testId).setInputFiles(tmpDir);
    return Promise.all(
        Array.from({ length: fileCount }, (_, i) =>
            page.getByText('✓').nth(i).waitFor({ state: 'visible' }),
        ),
    );
}
