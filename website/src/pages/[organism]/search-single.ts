import type { APIRoute } from 'astro';

import { LapisClient } from '../../services/lapisClient.ts';

export const GET: APIRoute = async ({ params, request, redirect }) => {
    const url = new URL(request.url);
    const submissionId = url.searchParams.get('submissionId');
    const organism = params.organism!;

    if (submissionId == null) {
        return new Response('submissionId parameter is required', { status: 400 });
    }
    const client = LapisClient.createForOrganism(organism);
    const responseData = await client.call('details', {
        submissionId,
        versionStatus: 'LATEST_VERSION',
        isRevocation: "false",
        fields: ['accessionVersion']
    });
    const accessionVersions = responseData.unwrapOr({data: []}).data.map(d => d.accessionVersion);
    if (accessionVersions.length === 1) {
        return redirect(`/seq/${accessionVersions[0]}`)
    }
    return redirect(`/${params.organism}/search?submissionId=${encodeURIComponent(submissionId)}`);
};
