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

/**
 * Selects `tmpDir` for the given file category and waits until the upload has finished.
 *
 * Do not wait for `fileCount` checkmarks here: in bulk mode the "N files uploaded and linked to
 * metadata!" status line renders a checkmark of its own, so the page already holds N checkmarks
 * once N-1 files have uploaded, and a subsequent submit is rejected with "Please wait for all
 * files to finish uploading before submitting.". Wait instead for the state that the submit
 * handler actually checks - the category being in `uploadCompleted`, which is the only state in
 * which the per-category buttons are enabled.
 */
export async function uploadFilesFromTmpDir(
    page: Page,
    fileCategory: string,
    tmpDir: string,
    fileCount: number,
    timeout = 30_000,
) {
    await page.getByRole('heading', { name: 'Extra files' }).scrollIntoViewIfNeeded();
    // Trigger the file upload without awaiting, so the waits below can observe it progressing.
    const filesSelected = page.getByTestId(fileCategory).setInputFiles(tmpDir);
    await expect(page.getByTestId(new RegExp(`^discard_${fileCategory}_`))).toHaveCount(fileCount, {
        timeout,
    });
    await expect(page.getByTestId(`add_button_${fileCategory}`)).toBeEnabled({ timeout });
    // Awaited last so a failure to select the files is reported rather than swallowed.
    await filesSelected;
}
