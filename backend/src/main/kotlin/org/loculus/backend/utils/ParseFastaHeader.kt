package org.loculus.backend.utils

import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.model.HEADER_TO_CONNECT_METADATA_AND_SEQUENCES
import org.loculus.backend.model.SegmentName
import org.loculus.backend.model.SubmissionId
import org.springframework.stereotype.Service

@Service
class ParseFastaHeader(private val backendConfig: BackendConfig) {
    private val nucleotideSequenceNamesByOrganism = backendConfig.organisms
        .mapValues {
            it.value.referenceGenomes.values
                .flatMap { referenceGenome -> referenceGenome.nucleotideSequences }
                .map { referenceSequence -> referenceSequence.name }
                .toSet()
        }
        .mapKeys { Organism(it.key) }

    fun parse(submissionId: String, organism: Organism): Pair<SubmissionId, SegmentName> {
        val nucleotideSequenceNames = nucleotideSequenceNamesByOrganism[organism]
            ?: throw BadRequestException(
                "Unknown organism: ${organism.name}. Valid organisms: ${
                    nucleotideSequenceNamesByOrganism.keys.joinToString(", ") { it.name }
                }",
            )

        if (nucleotideSequenceNames.size == 1) {
            return Pair(submissionId, "main")
        }

        val lastDelimiter = submissionId.lastIndexOf("_")
        if (lastDelimiter == -1) {
            throw BadRequestException(
                "The FASTA header $submissionId does not contain the segment name. Please provide the" +
                    " segment name in the format <$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES>_<segment name>",
            )
        }
        val isolateId = submissionId.substring(0, lastDelimiter)
        val segmentId = submissionId.substring(lastDelimiter + 1)

        return Pair(isolateId, segmentId)
    }
}
