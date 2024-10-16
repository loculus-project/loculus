import type { APIRoute } from 'astro';
import { Result, err } from 'neverthrow';

import { getConfiguredOrganisms } from '../../../config';
import type { ProblemDetail } from '../../../types/backend';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion';
import { LapisClient } from '../../../services/lapisClient';
import { routes } from '../../../routes/routes';

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

    // todo call lapisClient.getTsvDetails or something like that
    const tsvFile: Result<string, ProblemDetail> = (await lapisClient.getMetadataTsv(accessionVersion)).map((data) => {
        console.log("lalala");
        console.log(typeof data);
        console.log(data);
        return data as unknown as string;
    });

    // TODO maybe check if it's empty
    if (tsvFile.isOk()) {
        if (tsvFile.value.trim().length === 0) {
            return err({
                type: 'about:blank',
                title: 'Not Found',
                status: 0,
                detail: 'No data found for accession version ' + accessionVersion,
                instance: '/seq/' + accessionVersion + '.tsv',
            });
        }
    }

    return tsvFile.map((tsv) => ({
        type: ResultType.DATA,
        tsv
    }));
}

const getSequenceMetadataTsv = async (accessionVersion: string, isDownload: boolean) => {
    const organisms = getConfiguredOrganisms();
    const results = await Promise.all(
        organisms.map((organism) =>
            getSequenceMetadataTsvWithOrganism(accessionVersion, organism.key, isDownload),
        ),
    );
    const firstSuccess = results.find((result) => result.isOk());
    if (firstSuccess) {
        return firstSuccess;
    }
    return results[0];
}