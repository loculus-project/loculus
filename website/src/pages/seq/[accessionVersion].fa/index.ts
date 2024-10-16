import type { APIRoute } from 'astro';

import { getReferenceGenomes } from '../../../config.ts';
import { routes } from '../../../routes/routes.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { fastaEntryToString, parseFasta } from '../../../utils/parseFasta.ts';
import { createDownloadAPIRoute } from '../sequenceDownload.ts';

export const GET: APIRoute = createDownloadAPIRoute(
    'text/x-fasta',
    'fa',
    routes.sequencesFastaPage,
    async (accessionVersion: string, organism: string) => {
        const lapisClient = LapisClient.createForOrganism(organism);
        const referenceGenomes = getReferenceGenomes(organism);
        const segmentNames = referenceGenomes.nucleotideSequences.map((s) => s.name);
        const isMultiSegmented = segmentNames.length > 1;

        return !isMultiSegmented
            ? lapisClient.getUnalignedSequences(accessionVersion)
            : (await lapisClient.getUnalignedSequencesMultiSegment(accessionVersion, segmentNames)).map(
                  (segmentFastas) =>
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
                          .join(''),
              );
    },
);
