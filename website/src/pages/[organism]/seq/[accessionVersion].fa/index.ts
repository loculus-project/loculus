import type { APIRoute } from 'astro';
import { err, type Result } from 'neverthrow';

import { getReferenceGenomes } from '../../../../config.ts';
import { routes } from '../../../../routes.ts';
import { LapisClient } from '../../../../services/lapisClient.ts';
import type { ProblemDetail } from '../../../../types/backend.ts';
import { parseAccessionVersionFromString } from '../../../../utils/extractAccessionVersion.ts';
import { fastaEntryToString, parseFasta } from '../../../../utils/parseFasta.ts';

export const GET: APIRoute = async ({ params, url, redirect }) => {
    const accessionVersion = params.accessionVersion!;
    const organism = params.organism!;

    const urlParams = new URL(url).searchParams;
    const isDownload = urlParams.has('download');


    const result = await getSequenceDetailsUnalignedFasta(accessionVersion, organism);
    if (!result.isOk()) {
        return new Response(undefined, {
            status: 404,
        });
    }

    if (result.value.type === ResultType.REDIRECT) {
        return redirect(result.value.redirectUrl);
    }

    const headers = {
        'Content-Type': 'text/x-fasta',
        
    };
    if (isDownload) {
        const filename = `${organism}_${accessionVersion}.fasta`;
        headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    }

    

    return new Response(result.value.fasta, {
        headers
        
    });
};

enum ResultType {
    DATA = 'data',
    REDIRECT = 'redirect',
}

type Data = {
    type: ResultType.DATA;
    fasta: string;
};

type Redirect = {
    type: ResultType.REDIRECT;
    redirectUrl: string;
};

const getSequenceDetailsUnalignedFasta = async (
    accessionVersion: string,
    organism: string,
): Promise<Result<Data | Redirect, ProblemDetail>> => {
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const lapisClient = LapisClient.createForOrganism(organism);

    if (version === undefined) {
        const latestVersionResult = await lapisClient.getLatestAccessionVersion(accession);
        return latestVersionResult.map((latestVersion) => ({
            type: ResultType.REDIRECT,
            redirectUrl: routes.sequencesFastaPage(organism, latestVersion),
        }));
    }

    const referenceGenomes = getReferenceGenomes(organism);
    const segmentNames = referenceGenomes.nucleotideSequences.map((s) => s.name);
    const isMultiSegmented = segmentNames.length > 1;

    const fastaResult: Result<string, ProblemDetail> = !isMultiSegmented
        ? await lapisClient.getUnalignedSequences(accessionVersion)
        : (await lapisClient.getUnalignedSequencesMultiSegment(accessionVersion, segmentNames)).map((segmentFastas) =>
              segmentFastas
                  .map((fasta, i) => {
                      const parsed = parseFasta(fasta);
                      if (parsed.length === 0) {
                          return '';
                      }
                      const withSegmentSuffix = {
                          name: `${parsed[0].name}_${segmentNames[i]}`,
                          sequence: parsed[0].sequence,
                      };
                      return fastaEntryToString([withSegmentSuffix]);
                  })
                  .join('\n'),
          );
    if (fastaResult.isOk()) {
        if (fastaResult.value.trim().length === 0) {
            return err({
                type: 'about:blank',
                title: 'Not Found',
                status: 0,
                detail: 'No data found for accession version ' + accessionVersion,
                instance: '/seq/' + accessionVersion + '.fa',
            });
        }
    }
    const withNewLineTermination = fastaResult.map((fasta) => `${fasta}\n`);

    return withNewLineTermination.map((fasta) => ({
        type: ResultType.DATA,
        fasta,
    }));
};
