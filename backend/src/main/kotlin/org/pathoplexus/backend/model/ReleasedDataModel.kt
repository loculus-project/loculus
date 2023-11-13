package org.pathoplexus.backend.model

import com.fasterxml.jackson.databind.node.LongNode
import com.fasterxml.jackson.databind.node.TextNode
import mu.KotlinLogging
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.SiloVersionStatus
import org.pathoplexus.backend.service.Accession
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.RawProcessedData
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
        latestVersions: Map<Accession, Version>,
        latestRevocationVersions: Map<Accession, Version>,
    ): ProcessedData {
        val siloVersionStatus = computeSiloVersionStatus(rawProcessedData, latestVersions, latestRevocationVersions)

        val metadata = rawProcessedData.processedData.metadata +
            ("accession" to TextNode(rawProcessedData.accession)) +
            ("version" to LongNode(rawProcessedData.version)) +
            (HEADER_TO_CONNECT_METADATA_AND_SEQUENCES to TextNode(rawProcessedData.submissionId)) +
            ("accessionVersion" to TextNode(rawProcessedData.displayAccessionVersion())) +
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
        latestVersions: Map<Accession, Version>,
        latestRevocationVersions: Map<Accession, Version>,
    ): SiloVersionStatus {
        val isLatestVersion = (latestVersions[rawProcessedData.accession] == rawProcessedData.version)
        if (isLatestVersion) {
            return SiloVersionStatus.LATEST_VERSION
        }

        latestRevocationVersions[rawProcessedData.accession]?.let {
            if (it > rawProcessedData.version) {
                return SiloVersionStatus.REVOKED
            }
        }

        return SiloVersionStatus.REVISED
    }
}
