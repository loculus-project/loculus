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
        val referenceGenome = backendConfig.getInstanceConfig(organism).referenceGenomes

        val lastDelimiter = submissionId.lastIndexOf("_")
        if (lastDelimiter == -1) {
            return Pair(submissionId, "main")
        }

        return Pair(isolateId, segmentId)
    }
}
