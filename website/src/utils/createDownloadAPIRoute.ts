import type { APIRoute } from 'astro';
import { err, ok, type Result } from 'neverthrow';

import { parseAccessionVersionFromString } from './extractAccessionVersion';
import { getForwardedAccessToken } from './getAccessToken';
import { getConfiguredOrganisms } from '../config';
import { LapisProblemError } from './LapisProblemError';
import { LapisClient } from '../services/lapisClient';
import { type ProblemDetail } from '../types/backend';

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
 * A data downloader function. Receives an accessionVersion, an organism and the access token of the logged-in user
 * (if any) and returns a plain string of data (in a Promise, in a Result).
 */
export type DataDownloader = (
    accessionVersion: string,
    organism: string,
    accessToken: string | undefined,
) => Promise<Result<string, ProblemDetail>>;

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
    return async ({ params, redirect, request, locals }) => {
        const accessionVersion = params.accessionVersion ?? '';
        const accessToken = getForwardedAccessToken(request, locals.session);

        const isDownload = new URL(request.url).searchParams.has('download');

        const result = await getSequenceData(
            accessionVersion,
            fileSuffix,
            undefinedVersionRedirectUrl,
            getData,
            accessToken,
        );
        if (!result.isOk()) {
            return new Response(undefined, {
                status: result.error,
            });
        }

        if (result.value.type === ResultType.REDIRECT) {
            return redirect(result.value.redirectUrl);
        }

        const headers: Record<string, string> = {
            'Content-Type': contentType, // eslint-disable-line @typescript-eslint/naming-convention
            'Access-Control-Allow-Origin': '*', // eslint-disable-line @typescript-eslint/naming-convention
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
    accessToken: string | undefined,
): Promise<Result<Data | Redirect, ProblemDetail>> => {
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const lapisClient = LapisClient.createForOrganism(organism, accessToken);

    if (version === undefined) {
        const latestVersionResult = await lapisClient.getLatestAccessionVersion(accession);
        return latestVersionResult.map((latestVersion) => ({
            type: ResultType.REDIRECT,
            redirectUrl: undefinedVersionRedirectUrl(latestVersion),
        }));
    }

    const dataResult: Result<string, ProblemDetail> = await getter(accessionVersion, organism, accessToken);

    // the result might be 'ok' but empty.
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

/**
 * Returns the data, or the HTTP status to answer with: 401 if every organism rejected the token, 404 otherwise, so that
 * API clients can tell a bad token from an unknown sequence.
 */
const getSequenceData = async (
    accessionVersion: string,
    fileSuffix: string,
    undefinedVersionRedirectUrl: RedirectRoute,
    getter: DataDownloader,
    accessToken: string | undefined,
): Promise<Result<Data | Redirect, number>> => {
    // We don't know which organism the accessionVersion belongs to,
    // so we just try all of them until we get a success.
    const organisms = getConfiguredOrganisms();
    const promises = organisms.map(({ key }) =>
        getSequenceDataWithOrganism(
            accessionVersion,
            key,
            fileSuffix,
            undefinedVersionRedirectUrl,
            getter,
            accessToken,
        ).then((result) => {
            if (result.isOk()) {
                if (result.value.type === ResultType.REDIRECT) {
                    return ok(result.value);
                } else {
                    if (result.value.data.trim().split('\n').length > 1) {
                        return ok(result.value);
                    } else {
                        return Promise.reject(new Error('Result is empty - expected data.'));
                    }
                }
            } else {
                return Promise.reject(new LapisProblemError(result.error));
            }
        }),
    );

    try {
        const firstSuccess = await Promise.any(promises);
        return firstSuccess;
    } catch (errors) {
        const reasons: unknown[] = errors instanceof AggregateError ? errors.errors : [];
        const allUnauthorized =
            reasons.length > 0 &&
            reasons.every((reason) => reason instanceof LapisProblemError && reason.status === 401);
        return err(allUnauthorized ? 401 : 404);
    }
};
