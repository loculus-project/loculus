import type { Readable } from 'stream';

import type { APIRoute } from 'astro';
import type { AxiosResponse } from 'axios';
import { z } from 'zod';

import { cleanOrganism } from '../../../components/Navigation/cleanOrganism.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import type { ProblemDetail } from '../../../types/backend.ts';

type SearchParams = {
    segment?: string;
    headerFields: string[];
    downloadFileBasename: string;
    queryFilters: { [p: string]: string };
};

export const GET: APIRoute = async ({ params, request }) => {
    const searchParams = getSearchParams(new URL(request.url));

    const organism = cleanOrganism(params.organism);
    if (organism.organism === undefined) {
        return new Response(`Organism ${params.organism} not found`, { status: 404 });
    }
    const lapisClient = LapisClient.createForOrganism(organism.organism.key);

    const fastaHeaderMapResult = await getAccessionVersionToFastaHeaderMap(lapisClient, searchParams);

    if (fastaHeaderMapResult.isErr()) {
        return Response.json(fastaHeaderMapResult.error, { status: fastaHeaderMapResult.error.status });
    }

    const { fastaHeaderMap, dataVersion: detailsDataVersion } = fastaHeaderMapResult.value;

    const sequencesResponse = await lapisClient.streamSequences(searchParams.segment, {
        ...searchParams.queryFilters,
        dataFormat: 'ndjson',
    });

    const sequencesDataVersion = sequencesResponse.headers['lapis-data-version'];
    if (sequencesDataVersion !== detailsDataVersion) {
        return Response.json(
            {
                type: 'about:blank',
                title: 'Data version mismatch',
                status: 409,
                detail: `Data version mismatch: sequences ${sequencesDataVersion} vs details ${detailsDataVersion}`,
            } satisfies ProblemDetail,
            { status: 409 },
        );
    }

    return new Response(streamFasta(sequencesResponse, fastaHeaderMap, searchParams), {
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Type': 'text/x-fasta',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Disposition': `attachment; filename="${searchParams.downloadFileBasename}.fasta"`,
        },
    });
};

function getSearchParams(url: URL) {
    const searchParams = url.searchParams;

    const segment = searchParams.get('segment') ?? undefined;
    const downloadFileBasename = searchParams.get('downloadFileBasename') ?? 'sequences';
    const headerFields = searchParams.getAll('headerFields');
    searchParams.delete('segment');
    searchParams.delete('headerFields');
    searchParams.delete('downloadFileBasename');

    return {
        segment,
        headerFields,
        downloadFileBasename,
        queryFilters: Object.fromEntries(searchParams),
    } satisfies SearchParams;
}

async function getAccessionVersionToFastaHeaderMap(lapisClient: LapisClient, searchParams: SearchParams) {
    const details = await lapisClient.getDetails({
        ...searchParams.queryFilters,
        fields: [ACCESSION_VERSION_FIELD, ...searchParams.headerFields],
    });

    return details.map((it) => {
        const fastaHeaderMap = new Map<string, string>();

        for (const datum of it.data) {
            const { [ACCESSION_VERSION_FIELD]: accessionVersion, ...rest } = datum;
            const fastaHeader = Object.values(rest).join('|');
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
                            const reason = `Did not find fasta header for accession version ${data.accessionVersion}`;
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
