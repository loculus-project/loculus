import { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import { clearTmpDir } from './tmpdir';

export const isGzipName = (fileName: string) => fileName.toLowerCase().endsWith('.gz');

/** Gzips content whose file name ends in `.gz`. */
export const contentForUpload = (fileName: string, content: string, gzipLevel?: number) =>
    isGzipName(fileName)
        ? gzipSync(content, gzipLevel === undefined ? {} : { level: gzipLevel })
        : content;

/**
 * @param fileContents Struct containing possible mixture of:
 *                      filename -> filecontent, or
 *                      subfolder -> filename -> filecontent
 * @param tmpDir The temporary directory to use for storing files
 */
export async function prepareTmpDirForBulkUpload(
    fileContents: Record<string, string | Record<string, string>>,
    tmpDir: string,
    gzipLevel?: number,
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
                    fs.promises.writeFile(
                        path.join(tmpDir, p, fileName),
                        contentForUpload(fileName, fileContent, gzipLevel),
                    ),
                );
            else
                return fs.promises.writeFile(
                    path.join(tmpDir, p),
                    contentForUpload(p, f, gzipLevel),
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
            fs.promises.writeFile(
                path.join(tmpDir, fileName),
                contentForUpload(fileName, fileContent),
            ),
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
