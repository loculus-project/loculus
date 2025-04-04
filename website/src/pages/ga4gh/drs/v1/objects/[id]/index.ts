/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import crypto from 'crypto';

import type { APIRoute } from 'astro';
import { err, ok, Result } from 'neverthrow';

import { getConfiguredOrganisms } from '../../../../../../config';
import { routes } from '../../../../../../routes/routes';
import { LapisClient } from '../../../../../../services/lapisClient';
import type { ProblemDetail } from '../../../../../../types/backend';
import { parseAccessionVersionFromString } from '../../../../../../utils/extractAccessionVersion';

/**
 * DRS Object type definition according to GA4GH DRS v1.x
 * Snake case is required by the GA4GH DRS specification
 *
 * @see https://ga4gh.github.io/data-repository-service-schemas/docs/
 */

/**
 * DRS Access URL type definition
 */
interface DrsAccessUrl {
    url: string;
    headers: Record<string, string>;
}

interface DrsObject {
    id: string;
    name: string;

    self_uri: string;
    size: number;

    created_time: string;

    updated_time: string;
    version: string;

    mime_type: string;
    checksums: {
        type: string;
        checksum: string;
    }[];

    access_methods: {
        type: string;
        access_url: DrsAccessUrl | null;
        region: string | null;
        headers: Record<string, string> | null;
    }[];
    contents: unknown[];
    description: string;
    aliases: string[];
}

/**
 * GA4GH DRS API endpoint for retrieving object metadata
 *
 * This implements the GET /ga4gh/drs/v1/objects/{object_id} endpoint from the GA4GH DRS specification
 * https://ga4gh.github.io/data-repository-service-schemas/
 */
export const GET: APIRoute = async ({ params, request }) => {
    const objectId = params.id ?? '';
    const origin = new URL(request.url).origin;

    // In our implementation, object_id is the accessionVersion
    const result = await getDrsObject(objectId, origin);

    if (!result.isOk()) {
        return new Response(
            JSON.stringify({
                status_code: 404,
                msg: `Object not found: ${objectId}`,
            }),
            {
                status: 404,

                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );
    }

    return new Response(JSON.stringify(result.value), {
        status: 200,

        headers: {
            'Content-Type': 'application/json',
        },
    });
};

/**
 * Get DRS object metadata for a sequence
 */
async function getDrsObject(objectId: string, origin: string): Promise<Result<DrsObject, ProblemDetail>> {
    // Get sequence details from all configured organisms
    const organisms = getConfiguredOrganisms();

    // Parse the accessionVersion from the object_id
    const { accession, version } = parseAccessionVersionFromString(objectId);

    if (!accession || version === undefined) {
        return err({
            type: 'about:blank',
            title: 'Invalid object ID',
            detail: `Invalid object ID format: ${objectId}`,
            status: 400,
            instance: `/ga4gh/drs/v1/objects/${objectId}`,
        });
    }

    // Try to get metadata from each organism until we find one
    const promises = organisms.map(({ key }: { key: string }) =>
        getObjectMetadata(objectId, key, origin).then((result) =>
            result.isOk() ? ok(result.value) : Promise.reject(new Error(result.error.detail)),
        ),
    );

    try {
        const firstSuccess = await Promise.any(promises);

        return firstSuccess;
    } catch (_) {
        return err({
            type: 'about:blank',
            title: 'Object not found',
            detail: `Object not found: ${objectId}`,
            status: 404,
            instance: `/ga4gh/drs/v1/objects/${objectId}`,
        });
    }
}

/**
 * Get sequence metadata for a specific organism and format it as a DRS object
 */
async function getObjectMetadata(
    accessionVersion: string,
    organism: string,
    origin: string,
): Promise<Result<DrsObject, ProblemDetail>> {
    const lapisClient = LapisClient.createForOrganism(organism);

    const detailsResult = await lapisClient.getSequenceEntryVersionDetails(accessionVersion);

    if (!detailsResult.isOk()) {
        return detailsResult as Result<never, ProblemDetail>;
    }

    // Get sequence data from the seq endpoint
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);
    if (!accession || version === undefined) {
        return err({
            type: 'about:blank',
            title: 'Invalid accession version',
            detail: `Invalid accession version: ${accessionVersion}`,
            status: 400,
            instance: `/ga4gh/drs/v1/objects/${accessionVersion}`,
        });
    }

    // Construct the FASTA endpoint URL
    const fastaEndpoint = `${origin}${routes.sequenceEntryFastaPage({ accession, version })}`;

    try {
        // Fetch the sequence data
        const response = await fetch(fastaEndpoint);
        if (!response.ok) {
            return err({
                type: 'about:blank',
                title: 'Error fetching sequence data',
                detail: `Failed to fetch sequence data: ${response.statusText}`,
                status: response.status,
                instance: `/ga4gh/drs/v1/objects/${accessionVersion}`,
            });
        }

        const sequence = await response.text();
        const sequenceSize = Buffer.byteLength(sequence, 'utf8');
        const checksum = crypto.createHash('sha256').update(sequence).digest('hex');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return detailsResult.map((details: any) => {
            // Get timestamps from the submission details or use current time
            const timestamp = details.data[0]?.submittedAt
                ? details.data[0].submittedAt.toString()
                : new Date().toISOString();

            // Build the DRS object
            // Snake case properties are required by the GA4GH DRS API spec

            const drsObject: DrsObject = {
                id: accessionVersion,
                name: accessionVersion,

                self_uri: `drs://${new URL(origin).hostname}/${accessionVersion}`,
                size: sequenceSize, // Size in bytes of the sequence data

                created_time: timestamp,

                updated_time: timestamp,
                version: details.info.dataVersion,

                mime_type: 'text/x-fasta',
                checksums: [
                    {
                        type: 'sha-256',
                        checksum: checksum,
                    },
                ],

                access_methods: [
                    {
                        type: 'https',
                        access_url: {
                            url: `${origin}${routes.sequenceEntryFastaPage({ accession, version }, true)}`,
                            headers: {}
                        },
                        region: null,
                        headers: null,
                    },
                ],
                contents: [],
                description: `Sequence data for ${accessionVersion}`,
                aliases: [],
            };

            return drsObject;
        });
    } catch (error) {
        return err({
            type: 'about:blank',
            title: 'Error fetching sequence data',
            detail: `Failed to fetch sequence data: ${String(error)}`,
            status: 500,
            instance: `/ga4gh/drs/v1/objects/${accessionVersion}`,
        });
    }
}
