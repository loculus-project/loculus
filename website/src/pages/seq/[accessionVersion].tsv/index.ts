import type { APIRoute } from 'astro';
import { err, type Result } from 'neverthrow';

import { getConfiguredOrganisms } from '../../../config';
import type { ProblemDetail } from '../../../types/backend';

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
    throw new Error('Not implemented'); // TODO
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