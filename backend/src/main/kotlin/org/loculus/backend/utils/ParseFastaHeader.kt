package org.loculus.backend.utils

import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.model.SegmentName
import org.loculus.backend.model.SubmissionId
import org.springframework.stereotype.Service

@Service
class ParseFastaHeader(private val backendConfig: BackendConfig) {
    fun parse(submissionId: String, organism: Organism): Pair<SubmissionId, SegmentName> {
        val referenceGenome = backendConfig.getInstanceConfig(organism).referenceGenomes

        if (referenceGenome.nucleotideSequences.size == 1) {
            return Pair(submissionId, "main")
        }

        val validSegmentIds = referenceGenome.nucleotideSequences.map { it.name }

        val lastDelimiter = submissionId.lastIndexOf("_")
        if (lastDelimiter == -1) {
            throw BadRequestException(
                "The FASTA header $submissionId does not contain the segment name. Please provide the" +
                    " segment name in the format <submissionId>_<segment name>",
            )
        }
        val isolateId = submissionId.substring(0, lastDelimiter)
        val segmentId = submissionId.substring(lastDelimiter + 1)
        if (!validSegmentIds.contains(segmentId)) {
            throw BadRequestException(
                "The FASTA header $submissionId ends with the segment name $segmentId, which is not valid. " +
                    "Valid segment IDs: ${validSegmentIds.joinToString(", ")}",
            )
        }

        return Pair(isolateId, segmentId)
    }
}
