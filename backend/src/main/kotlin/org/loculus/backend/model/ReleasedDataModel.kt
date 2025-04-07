package org.loculus.backend.model

import com.fasterxml.jackson.databind.node.BooleanNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.LongNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import mu.KotlinLogging
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.MetadataMap
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.VersionStatus
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.datauseterms.DATA_USE_TERMS_TABLE_NAME
import org.loculus.backend.service.groupmanagement.GROUPS_TABLE_NAME
import org.loculus.backend.service.submission.CURRENT_PROCESSING_PIPELINE_TABLE_NAME
import org.loculus.backend.service.submission.EXTERNAL_METADATA_TABLE_NAME
import org.loculus.backend.service.submission.METADATA_UPLOAD_AUX_TABLE_NAME
import org.loculus.backend.service.submission.RawProcessedData
import org.loculus.backend.service.submission.SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME
import org.loculus.backend.service.submission.SEQUENCE_ENTRIES_TABLE_NAME
import org.loculus.backend.service.submission.SEQUENCE_UPLOAD_AUX_TABLE_NAME
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.service.submission.UpdateTrackerTable
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.EarliestReleaseDateFinder
import org.loculus.backend.utils.Version
import org.loculus.backend.utils.toTimestamp
import org.loculus.backend.utils.toUtcDateString
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

private val log = KotlinLogging.logger { }

val RELEASED_DATA_RELATED_TABLES: List<String> =
    listOf(
        CURRENT_PROCESSING_PIPELINE_TABLE_NAME,
        EXTERNAL_METADATA_TABLE_NAME,
        GROUPS_TABLE_NAME,
        METADATA_UPLOAD_AUX_TABLE_NAME,
        SEQUENCE_ENTRIES_TABLE_NAME,
        SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME,
        SEQUENCE_UPLOAD_AUX_TABLE_NAME,
        DATA_USE_TERMS_TABLE_NAME,
    )

@Service
open class ReleasedDataModel(
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val backendConfig: BackendConfig,
    private val dateProvider: DateProvider,
) {
    @Transactional(readOnly = true)
    open fun getReleasedData(organism: Organism): Sequence<ProcessedData<GeneticSequence>> {
        log.info { "Fetching released submissions from database for organism $organism" }

        val latestVersions = submissionDatabaseService.getLatestVersions(organism)
        val latestRevocationVersions = submissionDatabaseService.getLatestRevocationVersions(organism)

        val earliestReleaseDateConfig = backendConfig.getInstanceConfig(organism).schema.earliestReleaseDate
        val finder = if (earliestReleaseDateConfig.enabled) {
            EarliestReleaseDateFinder(earliestReleaseDateConfig.externalFields)
        } else {
            null
        }

        return submissionDatabaseService.streamReleasedSubmissions(organism)
            .map {
                computeAdditionalMetadataFields(
                    it,
                    latestVersions,
                    latestRevocationVersions,
                    finder,
                )
            }
    }

    @Transactional(readOnly = true)
    open fun getLastDatabaseWriteETag(tableNames: List<String>? = null): String {
        val query = UpdateTrackerTable.select(UpdateTrackerTable.lastTimeUpdatedDbColumn).apply {
            tableNames?.let {
                where { UpdateTrackerTable.tableNameColumn inList it }
            }
        }

        val lastUpdateTime = query
            .mapNotNull { it[UpdateTrackerTable.lastTimeUpdatedDbColumn] }
            .maxOrNull()
            // Replace not strictly necessary but does no harm and a) shows UTC, b) simplifies silo import script logic
            ?.replace(" ", "Z")
            ?: ""
        return "\"$lastUpdateTime\"" // ETag must be enclosed in double quotes
    }

    private fun conditionalMetadata(condition: Boolean, values: () -> MetadataMap): MetadataMap =
        if (condition) values() else emptyMap()

    private fun computeAdditionalMetadataFields(
        rawProcessedData: RawProcessedData,
        latestVersions: Map<Accession, Version>,
        latestRevocationVersions: Map<Accession, Version>,
        earliestReleaseDateFinder: EarliestReleaseDateFinder?,
    ): ProcessedData<GeneticSequence> {
        val versionStatus = computeVersionStatus(rawProcessedData, latestVersions, latestRevocationVersions)

        val currentDataUseTerms = computeDataUseTerm(rawProcessedData)
        val restrictedDataUseTermsUntil = if (currentDataUseTerms is DataUseTerms.Restricted) {
            TextNode(currentDataUseTerms.restrictedUntil.toString())
        } else {
            NullNode.getInstance()
        }

        val earliestReleaseDate = earliestReleaseDateFinder?.calculateEarliestReleaseDate(rawProcessedData)

        val dataUseTermsUrl: String? = backendConfig.dataUseTerms.urls?.let { urls ->
            when (currentDataUseTerms) {
                DataUseTerms.Open -> urls.open
                is DataUseTerms.Restricted -> urls.restricted
            }
        }

        var metadata = rawProcessedData.processedData.metadata +
            mapOf(
                ("accession" to TextNode(rawProcessedData.accession)),
                ("version" to LongNode(rawProcessedData.version)),
                (HEADER_TO_CONNECT_METADATA_AND_SEQUENCES to TextNode(rawProcessedData.submissionId)),
                ("accessionVersion" to TextNode(rawProcessedData.displayAccessionVersion())),
                ("isRevocation" to BooleanNode.valueOf(rawProcessedData.isRevocation)),
                ("submitter" to TextNode(rawProcessedData.submitter)),
                ("groupId" to IntNode(rawProcessedData.groupId)),
                ("groupName" to TextNode(rawProcessedData.groupName)),
                ("submittedDate" to TextNode(rawProcessedData.submittedAtTimestamp.toUtcDateString())),
                ("submittedAtTimestamp" to LongNode(rawProcessedData.submittedAtTimestamp.toTimestamp())),
                ("releasedAtTimestamp" to LongNode(rawProcessedData.releasedAtTimestamp.toTimestamp())),
                ("releasedDate" to TextNode(rawProcessedData.releasedAtTimestamp.toUtcDateString())),
                ("versionStatus" to TextNode(versionStatus.name)),
                ("pipelineVersion" to LongNode(rawProcessedData.pipelineVersion)),
            ) +
            conditionalMetadata(
                backendConfig.dataUseTerms.enabled,
                {
                    mapOf(
                        "dataUseTerms" to TextNode(currentDataUseTerms.type.name),
                        "dataUseTermsRestrictedUntil" to restrictedDataUseTermsUntil,
                    )
                },
            ) +
            conditionalMetadata(
                rawProcessedData.isRevocation,
                {
                    mapOf(
                        "versionComment" to TextNode(rawProcessedData.versionComment),
                    )
                },
            ) +
            conditionalMetadata(
                earliestReleaseDate != null,
                {
                    mapOf(
                        "earliestReleaseDate" to TextNode(earliestReleaseDate!!.toUtcDateString()),
                    )
                },
            ) +
            conditionalMetadata(
                dataUseTermsUrl != null,
                {
                    mapOf(
                        "dataUseTermsUrl" to TextNode(dataUseTermsUrl!!),
                    )
                },
            )

        return ProcessedData(
            metadata = metadata,
            unalignedNucleotideSequences = rawProcessedData.processedData.unalignedNucleotideSequences,
            alignedNucleotideSequences = rawProcessedData.processedData.alignedNucleotideSequences,
            nucleotideInsertions = rawProcessedData.processedData.nucleotideInsertions,
            aminoAcidInsertions = rawProcessedData.processedData.aminoAcidInsertions,
            alignedAminoAcidSequences = rawProcessedData.processedData.alignedAminoAcidSequences,
            files = rawProcessedData.processedData.files,
        )
    }

    private fun computeDataUseTerm(rawProcessedData: RawProcessedData): DataUseTerms = if (
        rawProcessedData.dataUseTerms is DataUseTerms.Restricted &&
        rawProcessedData.dataUseTerms.restrictedUntil > dateProvider.getCurrentDate()
    ) {
        DataUseTerms.Restricted(rawProcessedData.dataUseTerms.restrictedUntil)
    } else {
        DataUseTerms.Open
    }

    // LATEST_VERSION: This is the highest version of the sequence entry
    // REVOKED: This is not the highest version of the sequence entry, and a higher version is a revocation
    // REVISED: This is not the highest version of the sequence entry, and no higher version is a revocation
    // Note: a revocation entry is only REVOKED when there's a higher version that is a revocation
    private fun computeVersionStatus(
        rawProcessedData: RawProcessedData,
        latestVersions: Map<Accession, Version>,
        latestRevocationVersions: Map<Accession, Version>,
    ): VersionStatus {
        val isLatestVersion = (latestVersions[rawProcessedData.accession] == rawProcessedData.version)
        if (isLatestVersion) {
            return VersionStatus.LATEST_VERSION
        }

        latestRevocationVersions[rawProcessedData.accession]?.let {
            if (it > rawProcessedData.version) {
                return VersionStatus.REVOKED
            }
        }

        return VersionStatus.REVISED
    }
}
