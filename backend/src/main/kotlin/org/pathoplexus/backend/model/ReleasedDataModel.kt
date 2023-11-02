package org.pathoplexus.backend.model

import com.fasterxml.jackson.databind.node.LongNode
import com.fasterxml.jackson.databind.node.TextNode
import mu.KotlinLogging
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.SiloVersionStatus
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.RawProcessedData
import org.pathoplexus.backend.service.SequenceId
import org.pathoplexus.backend.service.Version
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

private val log = KotlinLogging.logger { }

@Service
class ReleasedDataModel(private val databaseService: DatabaseService) {
    @Transactional(readOnly = true)
    fun getReleasedData(): Sequence<ProcessedData> {
        log.info { "fetching released submissions" }

        val latestVersions = databaseService.getLatestVersions()
        val latestRevocationVersions = databaseService.getLatestRevocationVersions()

        return databaseService.streamReleasedSubmissions()
            .map { computeAdditionalMetadataFields(it, latestVersions, latestRevocationVersions) }
    }

    private fun computeAdditionalMetadataFields(
        rawProcessedData: RawProcessedData,
        latestVersions: Map<SequenceId, Version>,
        latestRevocationVersions: Map<SequenceId, Version>,
    ): ProcessedData {
        val siloVersionStatus = computeSiloVersionStatus(rawProcessedData, latestVersions, latestRevocationVersions)

        val metadata = rawProcessedData.processedData.metadata +
            ("sequenceId" to TextNode(rawProcessedData.sequenceId.toString())) +
            ("version" to LongNode(rawProcessedData.version)) +
            ("customId" to TextNode(rawProcessedData.customId)) +
            ("sequenceVersion" to TextNode(rawProcessedData.displaySequenceVersion())) +
            ("isRevocation" to TextNode(rawProcessedData.isRevocation.toString())) +
            ("submitter" to TextNode(rawProcessedData.submitter)) +
            ("submittedAt" to TextNode(rawProcessedData.submittedAt.toString())) +
            ("versionStatus" to TextNode(siloVersionStatus.name))

        return ProcessedData(
            metadata = metadata,
            unalignedNucleotideSequences = rawProcessedData.processedData.unalignedNucleotideSequences,
            alignedNucleotideSequences = rawProcessedData.processedData.alignedNucleotideSequences,
            nucleotideInsertions = rawProcessedData.processedData.nucleotideInsertions,
            aminoAcidInsertions = rawProcessedData.processedData.aminoAcidInsertions,
            alignedAminoAcidSequences = rawProcessedData.processedData.alignedAminoAcidSequences,
        )
    }

    private fun computeSiloVersionStatus(
        rawProcessedData: RawProcessedData,
        latestVersions: Map<SequenceId, Version>,
        latestRevocationVersions: Map<SequenceId, Version>,
    ): SiloVersionStatus {
        val isLatestVersion = (latestVersions[rawProcessedData.sequenceId] == rawProcessedData.version)
        if (isLatestVersion) {
            return SiloVersionStatus.LATEST_VERSION
        }

        latestRevocationVersions[rawProcessedData.sequenceId]?.let {
            if (it > rawProcessedData.version) {
                return SiloVersionStatus.REVOKED
            }
        }

        return SiloVersionStatus.REVISED
    }
}
