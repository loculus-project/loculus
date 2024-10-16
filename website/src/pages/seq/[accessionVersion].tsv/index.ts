import type { APIRoute } from 'astro';
import { type Result, err } from 'neverthrow';

import { getConfiguredOrganisms } from '../../../config';
import { routes } from '../../../routes/routes';
import { LapisClient } from '../../../services/lapisClient';
import type { ProblemDetail } from '../../../types/backend';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion';

export const GET: APIRoute = async ({ params, redirect, request }) => {
    const accessionVersion = params.accessionVersion!;

    const isDownload = new URL(request.url).searchParams.has('download');

    const result = await getSequenceMetadataTsv(accessionVersion, isDownload);
    if (!result.isOk()) {
        return new Response(undefined, {
            status: 404,
        });
    }

    if (result.value.type === ResultType.REDIRECT) {
        return redirect(result.value.redirectUrl);
    }

    const headers: Record<string, string> = {
        'Content-Type': 'text/tab-separated-values',
    };
    if (isDownload) {
        const filename = `${accessionVersion}.tsv`;
        headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    }

    return new Response(result.value.tsv, {
        headers,
    });
};

enum ResultType {
    DATA = 'data',
    REDIRECT = 'redirect',
}

type Data = {
    type: ResultType.DATA;
    tsv: string;
};

type Redirect = {
    type: ResultType.REDIRECT;
    redirectUrl: string;
};

const getSequenceMetadataTsvWithOrganism = async (
    accessionVersion: string,
    organism: string,
    isDownload: boolean,
): Promise<Result<Data | Redirect, ProblemDetail>> => {
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const lapisClient = LapisClient.createForOrganism(organism);

    if (version === undefined) {
        const latestVersionResult = await lapisClient.getLatestAccessionVersion(accession);
        return latestVersionResult.map((latestVersion) => ({
            type: ResultType.REDIRECT,
            redirectUrl: routes.sequencesTsvPage(latestVersion, isDownload),
        }));
    }

    const details: Result<string, ProblemDetail> =
        await lapisClient.getSequenceEntryVersionDetailsTsv(accessionVersion);
        
    if (details.isOk()) {
        if (details.value.trim().length === 0) {
            return err({
                type: 'about:blank',
                title: 'Not Found',
                status: 0,
                detail: 'No data found for accession version ' + accessionVersion,
                instance: '/seq/' + accessionVersion + '.tsv',
            });
        }
    }

    return details.map((tsv) => ({
        type: ResultType.DATA,
        tsv,
    }));
};

const getSequenceMetadataTsv = async (accessionVersion: string, isDownload: boolean) => {
    const organisms = getConfiguredOrganisms();
    const results = await Promise.all(
        organisms.map((organism) => getSequenceMetadataTsvWithOrganism(accessionVersion, organism.key, isDownload)),
    );
    const firstSuccess = results.find((result) => result.isOk());
    if (firstSuccess) {
        return firstSuccess;
    }
    return results[0];
};
