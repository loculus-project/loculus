/* eslint-disable @typescript-eslint/naming-convention */

import type { APIRoute } from 'astro';
import { err, ok, Result } from 'neverthrow';

import { getConfiguredOrganisms } from '../../../../../../../config';
import { routes } from '../../../../../../../routes/routes.ts';
import { LapisClient } from '../../../../../../../services/lapisClient.ts';
import type { ProblemDetail } from '../../../../../../../types/backend.ts';
import { parseAccessionVersionFromString } from '../../../../../../../utils/extractAccessionVersion';
/**
 * DRS Access URL response
 */
interface DrsAccessURL {
    url: string;
    headers: Record<string, string>;
}

/**
 * GA4GH DRS API endpoint for accessing objects
 *
 * This implements the GET /ga4gh/drs/v1/objects/{object_id}/access/{access_id} endpoint
 * from the GA4GH DRS specification.
 * https://ga4gh.github.io/data-repository-service-schemas/
 */
export const GET: APIRoute = async ({ params, request }) => {
    const objectId = params.id ?? '';
    const accessId = params.access_id ?? '';

    // Currently only support 'fasta' access_id
    if (accessId !== 'fasta') {
        return new Response(
            JSON.stringify({
                status_code: 400,
                msg: `Unsupported access ID: ${accessId}. Currently only 'fasta' is supported.`,
            }),
            {
                status: 400,

                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );
    }

    // Get the site URL base from request
    const origin = new URL(request.url).origin;

    // In our implementation, object_id is the accessionVersion
    const result = await getAccessURL(objectId, origin);

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
 * Generate an access URL for the sequence
 */
async function getAccessURL(objectId: string, origin: string): Promise<Result<DrsAccessURL, ProblemDetail>> {
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

    // Try to find the organism this sequence belongs to
    for (const organism of organisms) {
        const key = organism.key;
        const exists = await checkSequenceExists(objectId, key);
        if (exists) {
            // Construct the access URL using the existing .fa endpoint
            const fastaPath = routes.sequenceEntryFastaPage(
                {
                    accession,
                    version,
                },
                true,
            ); // Set download=true to get a downloadable version

            // Combine the origin with the path to get a full URL
            const accessUrl = `${origin}${fastaPath}`;

            return ok({
                url: accessUrl,
                headers: {},
            });
        }
    }

    return err({
        type: 'about:blank',
        title: 'Object not found',
        detail: `Object not found: ${objectId}`,
        status: 404,
        instance: `/ga4gh/drs/v1/objects/${objectId}`,
    });
}

/**
 * Check if a sequence exists for the given organism
 */
async function checkSequenceExists(accessionVersion: string, organism: string): Promise<boolean> {
    const lapisClient = LapisClient.createForOrganism(organism);
    const detailsResult = await lapisClient.getSequenceEntryVersionDetails(accessionVersion);
    return detailsResult.isOk() && detailsResult.value.data.length > 0;
}
