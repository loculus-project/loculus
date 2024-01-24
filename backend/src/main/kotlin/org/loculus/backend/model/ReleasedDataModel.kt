package org.loculus.backend.model

import com.fasterxml.jackson.databind.node.LongNode
import com.fasterxml.jackson.databind.node.TextNode
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import mu.KotlinLogging
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SiloVersionStatus
import org.loculus.backend.service.submission.RawProcessedData
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

private val log = KotlinLogging.logger { }

@Service
class ReleasedDataModel(private val submissionDatabaseService: SubmissionDatabaseService) {
    @Transactional(readOnly = true)
    fun getReleasedData(organism: Organism): Sequence<ProcessedData> {
        log.info { "fetching released submissions" }

        val latestVersions = submissionDatabaseService.getLatestVersions(organism)
        val latestRevocationVersions = submissionDatabaseService.getLatestRevocationVersions(organism)

        return submissionDatabaseService.streamReleasedSubmissions(organism)
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
            ("group" to TextNode(rawProcessedData.group)) +
            ("submittedAt" to LongNode(rawProcessedData.submittedAt.toTimestamp())) +
            ("releasedAt" to LongNode(rawProcessedData.releasedAt.toTimestamp())) +
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

private fun LocalDateTime.toTimestamp() = this.toInstant(TimeZone.UTC).epochSeconds
