import type { Readable } from 'stream';

import type { APIRoute } from 'astro';
import type { AxiosError, AxiosResponse } from 'axios';
import { err, ok } from 'neverthrow';
import { z } from 'zod';

import { cleanOrganism } from '../../../components/Navigation/cleanOrganism.ts';
import { getReferenceGenomes } from '../../../config.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import type { ProblemDetail } from '../../../types/backend.ts';

type SearchParams = {
    segment?: string;
    headerFields: string[];
    downloadFileBasename: string;
    queryFilters: { [p: string]: string };
};

export const GET: APIRoute<never, { organism: string }> = async ({ params, request }) => {
    const organism = cleanOrganism(params.organism).organism?.key;
    if (organism === undefined) {
        return new Response(`Organism ${params.organism} not found`, { status: 404 });
    }

    const searchParamsResult = getSearchParams(new URL(request.url), organism);
    if (searchParamsResult.isErr()) {
        return Response.json(
            {
                type: 'about:blank',
                title: 'Bad Request',
                status: 400,
                detail: searchParamsResult.error,
            } satisfies ProblemDetail,
            { status: 400 },
        );
    }
    const searchParams = searchParamsResult.value;

    const data = await fetchDataWithRetry(organism, searchParams);
    if (data.isErr()) {
        return data.error;
    }
    const { sequencesResponse, fastaHeaderMap } = data.value;

    return new Response(streamFasta(sequencesResponse, fastaHeaderMap, searchParams), {
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Type': 'text/x-fasta',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Disposition': `attachment; filename="${searchParams.downloadFileBasename}.fasta"`,
        },
    });
};

function getSearchParams(url: URL, organism: string) {
    const searchParams = url.searchParams;

    const segment = searchParams.get('segment') ?? undefined;
    const downloadFileBasename = searchParams.get('downloadFileBasename') ?? 'sequences';
    const headerFields = searchParams.getAll('headerFields');
    searchParams.delete('segment');
    searchParams.delete('headerFields');
    searchParams.delete('downloadFileBasename');

    const nucleotideSequences = getReferenceGenomes(organism).nucleotideSequences;
    const isMultiSegmented = nucleotideSequences.length > 1;
    if (isMultiSegmented) {
        if (segment === undefined) {
            return err("Missing required parameter: 'segment'");
        }
        if (!nucleotideSequences.some((it) => it.name === segment)) {
            return err(
                `Unknown segment '${segment}', known segments are ${nucleotideSequences.map((it) => it.name).join(', ')}`,
            );
        }
    }
    if (!isMultiSegmented && segment !== undefined) {
        return err("Parameter 'segment' not allowed for single-segmented organism");
    }
    if (headerFields.length === 0) {
        return err("Missing required parameter: 'headerFields'");
    }

    return ok({
        segment,
        headerFields,
        downloadFileBasename,
        queryFilters: Object.fromEntries(searchParams),
    } satisfies SearchParams);
}

async function fetchDataWithRetry(organism: string, searchParams: SearchParams) {
    const data = await fetchData(organism, searchParams);
    if (data.isErr()) {
        return data;
    }

    const dataVersionMatches = (values: (typeof data)['value']) => {
        const { detailsDataVersion, sequencesResponse } = values;
        const sequencesDataVersion = sequencesResponse.headers['lapis-data-version'];
        return sequencesDataVersion === detailsDataVersion;
    };

    if (dataVersionMatches(data.value)) {
        return data;
    }

    const retryData = await fetchData(organism, searchParams);
    if (retryData.isErr()) {
        return retryData;
    }

    if (dataVersionMatches(retryData.value)) {
        return retryData;
    }

    const { detailsDataVersion, sequencesResponse } = retryData.value;
    return err(
        Response.json(
            {
                type: 'about:blank',
                title: 'Data version mismatch',
                status: 503,
                detail: `Data version mismatch: sequences ${sequencesResponse.headers['lapis-data-version']} vs details ${detailsDataVersion}`,
            } satisfies ProblemDetail,
            { status: 503 },
        ),
    );
}

async function fetchData(organism: string, searchParams: SearchParams) {
    const lapisClient = LapisClient.createForOrganism(organism);

    const fastaHeaderMapResult = await getAccessionVersionToFastaHeaderMap(lapisClient, searchParams);

    if (fastaHeaderMapResult.isErr()) {
        return err(Response.json(fastaHeaderMapResult.error, { status: fastaHeaderMapResult.error.status }));
    }

    const { fastaHeaderMap, dataVersion: detailsDataVersion } = fastaHeaderMapResult.value;

    let sequencesResponse;
    try {
        sequencesResponse = await lapisClient.streamSequences(searchParams.segment, {
            ...searchParams.queryFilters,
            dataFormat: 'ndjson',
        });
    } catch (e) {
        const response = (e as AxiosError).response;
        const status = response?.status ?? 500;
        const requestId = response?.headers['x-request-id'];

        return err(
            Response.json(
                {
                    type: 'about:blank',
                    title: 'Bad Request',
                    status,
                    detail: `Failed to fetch sequences: ${response?.statusText ?? 'unknown error'} - LAPIS request id ${requestId}`,
                } satisfies ProblemDetail,
                { status: status },
            ),
        );
    }

    return ok({ sequencesResponse, fastaHeaderMap, detailsDataVersion } as const);
}

async function getAccessionVersionToFastaHeaderMap(lapisClient: LapisClient, searchParams: SearchParams) {
    const details = await lapisClient.getDetails({
        ...searchParams.queryFilters,
        fields: [ACCESSION_VERSION_FIELD, ...searchParams.headerFields],
    });

    const shouldContainAccessionVersion = searchParams.headerFields.includes(ACCESSION_VERSION_FIELD);

    return details.map((it) => {
        const fastaHeaderMap = new Map<string, string>();

        for (const datum of it.data) {
            const { [ACCESSION_VERSION_FIELD]: accessionVersion, ...rest } = datum;
            const fastaHeader = Object.values(shouldContainAccessionVersion ? datum : rest).join('|');
            fastaHeaderMap.set(accessionVersion as string, fastaHeader);
        }

        return {
            fastaHeaderMap,
            dataVersion: it.info.dataVersion,
        };
    });
}

function streamFasta(
    sequencesResponse: AxiosResponse<Readable>,
    fastaHeaderMap: Map<string, string>,
    searchParams: SearchParams,
) {
    const sequenceName = searchParams.segment ?? 'main';
    const ndjsonLineSchema = z.object({
        [ACCESSION_VERSION_FIELD]: z.string(),
        [sequenceName]: z.string(),
    });

    let streamEnded = false;

    return new ReadableStream({
        start(controller) {
            let buffer = '';
            const encoder = new TextEncoder();

            function error(reason: unknown) {
                if (streamEnded) {
                    return;
                }
                controller.error(reason);
                streamEnded = true;
            }

            function processBuffer() {
                if (streamEnded) {
                    return;
                }

                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (line.trim() === '') {
                        continue;
                    }

                    try {
                        const data = ndjsonLineSchema.parse(JSON.parse(line));

                        const fastaHeader = fastaHeaderMap.get(data.accessionVersion as string);
                        if (!fastaHeader) {
                            const reason = `Did not find metadata for accession version ${data.accessionVersion}`;
                            controller.enqueue(encoder.encode(`Failed to write fasta - ${reason}`));
                            error(reason);
                            return;
                        }

                        controller.enqueue(encoder.encode(`>${fastaHeader}\n${data[sequenceName]}\n`));
                    } catch (err) {
                        const reason = `Error processing line: ${err}, ${line}`;
                        controller.enqueue(encoder.encode(`Failed to write fasta - ${reason}`));
                        error(reason);
                        return;
                    }
                }
            }

            sequencesResponse.data.on('data', (chunk: Buffer) => {
                buffer += chunk.toString();
                processBuffer();
            });

            sequencesResponse.data.on('end', () => {
                processBuffer();
                if (!streamEnded) {
                    streamEnded = true;
                    controller.close();
                }
            });

            sequencesResponse.data.on('error', (err) => {
                error(err);
            });
        },
        cancel() {
            streamEnded = true;
        },
    });
}
