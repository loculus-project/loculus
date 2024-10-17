import type { APIRoute } from 'astro';
import { err, type Result } from 'neverthrow';

import { getConfiguredOrganisms } from '../../config';
import { LapisClient } from '../../services/lapisClient';
import { type ProblemDetail } from '../../types/backend';
import { parseAccessionVersionFromString } from '../../utils/extractAccessionVersion';

export type RedirectRoute = (
    accessionVersion:
        | string
        | {
              accession: string;
              version: number;
          },
    download?: boolean,
) => string;

/**
 * A data downloader function. Receives an accessionVersion and an organism and returns a plain string of data
 * (in a Promise, in a Result).
 */
export type DataDownloader = (accessionVersion: string, organism: string) => Promise<Result<string, ProblemDetail>>;

/**
 * Given a data fetcher function and some information about the data, this will create an API route
 * that fetches the data.
 * @param contentType The content type to use in the HTTP header
 * @param fileSuffix the file suffix for this data type (i.e. 'fa' or 'tsv')
 * @param undefinedVersionRedirectUrl In case the accessionVersion has no version and it needs to be determined
 * where to redirect to.
 * @param getData The function that does the actual data fetching.
 * @returns An APIRoute.
 */
export function createDownloadAPIRoute(
    contentType: string,
    fileSuffix: string,
    undefinedVersionRedirectUrl: RedirectRoute,
    getData: DataDownloader,
): APIRoute {
    return async ({ params, redirect, request }) => {
        const accessionVersion = params.accessionVersion!;

        const isDownload = new URL(request.url).searchParams.has('download');

        const result = await getSequenceData(accessionVersion, fileSuffix, undefinedVersionRedirectUrl, getData);
        if (!result.isOk()) {
            return new Response(undefined, {
                status: 404,
            });
        }

        if (result.value.type === ResultType.REDIRECT) {
            return redirect(result.value.redirectUrl);
        }

        const headers: Record<string, string> = {
            'Content-Type': contentType,
        };
        if (isDownload) {
            const filename = `${accessionVersion}.${fileSuffix}`;
            headers['Content-Disposition'] = `attachment; filename="${filename}"`;
        }

        return new Response(result.value.data, {
            headers,
        });
    };
}

enum ResultType {
    DATA = 'data',
    REDIRECT = 'redirect',
}

type Data = {
    type: ResultType.DATA;
    data: string;
};

type Redirect = {
    type: ResultType.REDIRECT;
    redirectUrl: string;
};

const getSequenceDataWithOrganism = async (
    accessionVersion: string,
    organism: string,
    fileSuffix: string,
    undefinedVersionRedirectUrl: RedirectRoute,
    getter: DataDownloader,
): Promise<Result<Data | Redirect, ProblemDetail>> => {
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const lapisClient = LapisClient.createForOrganism(organism);

    if (version === undefined) {
        const latestVersionResult = await lapisClient.getLatestAccessionVersion(accession);
        return latestVersionResult.map((latestVersion) => ({
            type: ResultType.REDIRECT,
            redirectUrl: undefinedVersionRedirectUrl(latestVersion),
        }));
    }

    const dataResult: Result<string, ProblemDetail> = await getter(accessionVersion, organism);

    if (dataResult.isOk()) {
        if (dataResult.value.trim().length === 0) {
            return err({
                type: 'about:blank',
                title: 'Not Found',
                status: 0,
                detail: 'No data found for accession version ' + accessionVersion,
                instance: '/seq/' + accessionVersion + `.${fileSuffix}`,
            });
        }
    }

    return dataResult.map((data) => ({
        type: ResultType.DATA,
        data,
    }));
};

const getSequenceData = async (
    accessionVersion: string,
    fileSuffix: string,
    undefinedVersionRedirectUrl: RedirectRoute,
    getter: DataDownloader,
) => {
    // We don't know which organism the accessionVersion belongs to,
    // so we just try all of them until we get a success.
    const organisms = getConfiguredOrganisms();
    const results = await Promise.all(
        organisms.map((organism) =>
            getSequenceDataWithOrganism(
                accessionVersion,
                organism.key,
                fileSuffix,
                undefinedVersionRedirectUrl,
                getter,
            ),
        ),
    );
    const firstSuccess = results.find((result) => result.isOk());
    if (firstSuccess) {
        return firstSuccess;
    }
    return results[0];
};
