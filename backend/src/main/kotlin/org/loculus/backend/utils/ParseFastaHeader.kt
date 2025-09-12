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
    fun parse(submissionId: String, organism: Organism): Pair<SubmissionId, SegmentName> {
        val referenceGenome = backendConfig.getInstanceConfig(organism).referenceGenome

        if (referenceGenome.nucleotideSequences.size == 1) {
            return Pair(submissionId, "main")
        }

        val validSegmentIds = referenceGenome.nucleotideSequences.map { it.name }

        val lastDelimiter = submissionId.lastIndexOf("_")
        if (lastDelimiter == -1) {
            throw BadRequestException(
                "The FASTA header $submissionId does not contain the segment name. Please provide the" +
                    " segment name in the format <$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES>_<segment name>",
            )
        }
        val isolateId = submissionId.take(lastDelimiter)
        val segmentId = submissionId.substring(lastDelimiter + 1)
        if (!validSegmentIds.contains(segmentId)) {
            throw BadRequestException(
                "The FASTA header $submissionId ends with the segment name $segmentId, which is not valid. " +
                    "Valid segment names: ${validSegmentIds.joinToString(", ")}",
            )
        }

        return Pair(isolateId, segmentId)
    }
}
