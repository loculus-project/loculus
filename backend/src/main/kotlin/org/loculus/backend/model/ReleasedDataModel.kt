package org.loculus.backend.model

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.BooleanNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.LongNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import mu.KotlinLogging
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.FileCategory
import org.loculus.backend.api.FileCategoryFilesMap
import org.loculus.backend.api.FileIdAndNameAndReadUrl
import org.loculus.backend.api.MetadataMap
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ReleasedData
import org.loculus.backend.api.VersionStatus
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.FileUrlType
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.groupmanagement.GROUPS_TABLE_NAME
import org.loculus.backend.service.submission.METADATA_UPLOAD_AUX_TABLE_NAME
import org.loculus.backend.service.submission.RawProcessedData
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.service.submission.UpdateTrackerTable
import org.loculus.backend.service.submission.dbtables.CURRENT_PROCESSING_PIPELINE_TABLE_NAME
import org.loculus.backend.service.submission.dbtables.EXTERNAL_METADATA_TABLE_NAME
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.EarliestReleaseDateFinder
import org.loculus.backend.utils.Version
import org.loculus.backend.utils.toTimestamp
import org.loculus.backend.utils.toUtcDateString
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

private val log = KotlinLogging.logger { }

@Service
open class ReleasedDataModel(
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val backendConfig: BackendConfig,
    private val dateProvider: DateProvider,
    private val s3Service: S3Service,
    private val objectMapper: ObjectMapper,
) {
    @Transactional(readOnly = true)
    open fun getReleasedData(organism: Organism): Sequence<ReleasedData> {
        log.info { "Fetching released submissions from database for organism $organism" }

        val latestVersions = submissionDatabaseService.getLatestVersions(organism)
        val latestRevocationVersions = submissionDatabaseService.getLatestRevocationVersions(organism)

        val earliestReleaseDateConfig = backendConfig.getInstanceConfig(organism).schema.earliestReleaseDate
        val finder = if (earliestReleaseDateConfig.enabled) {
            EarliestReleaseDateFinder(earliestReleaseDateConfig.externalFields)
        } else {
            null
        }

        log.info { "Starting to stream released submissions for organism $organism" }
        return submissionDatabaseService.streamReleasedSubmissions(organism)
            .map {
                computeAdditionalMetadataFields(
                    it,
                    latestVersions,
                    latestRevocationVersions,
                    finder,
                    organism,
                )
            }
    }

    @Transactional(readOnly = true)
    open fun getOrganismReleasedLastProcessedTime(organism: Organism): String {
        val pipelineVersion = submissionDatabaseService.getCurrentProcessingPipelineVersion(organism)
        val lastFinishedProcessingAt =
            submissionDatabaseService.getLatestFinishedProcessingAtForReleasedData(organism, pipelineVersion)
        val lastExternalMetadataUpdatedAt =
            submissionDatabaseService.getLatestExternalMetadataUpdatedAtForReleasedData(organism)
        val lastDataUseTermsUpdatedAt =
            submissionDatabaseService.getLatestDataUseTermsUpdatedAtForReleasedData(organism)
        val lastFinishedProcessingAtFormatted = lastFinishedProcessingAt ?: ""
        val lastExternalMetadataUpdatedAtFormatted = lastExternalMetadataUpdatedAt ?: ""
        val lastDataUseTermsUpdatedAtFormatted = lastDataUseTermsUpdatedAt ?: ""
        val etagValue =
            "$pipelineVersion:$lastFinishedProcessingAtFormatted:$lastExternalMetadataUpdatedAtFormatted:$lastDataUseTermsUpdatedAtFormatted"
        return "\"$etagValue\""
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
        organism: Organism,
    ): ReleasedData {
        val versionStatus = computeVersionStatus(rawProcessedData, latestVersions, latestRevocationVersions)

        val currentDataUseTerms = computeDataUseTerm(rawProcessedData)
        val restrictedDataUseTermsUntil = if (currentDataUseTerms is DataUseTerms.Restricted) {
            TextNode(currentDataUseTerms.restrictedUntil.toString())
        } else {
            NullNode.getInstance()
        }
        val dataBecameOpenAt = computeDataBecameOpenAt(rawProcessedData, currentDataUseTerms)

        val earliestReleaseDate = earliestReleaseDateFinder?.calculateEarliestReleaseDate(rawProcessedData)

        val dataUseTermsUrl: String? = backendConfig.dataUseTerms.urls?.let { urls ->
            when (currentDataUseTerms) {
                DataUseTerms.Open -> urls.open
                is DataUseTerms.Restricted -> urls.restricted
            }
        }

        val filesFieldNames = backendConfig.getInstanceConfig(organism).schema.files.map { it.name }

        val metadata = rawProcessedData.processedData.metadata +
            mapOf(
                ("accession" to TextNode(rawProcessedData.accession)),
                ("version" to LongNode(rawProcessedData.version)),
                ("submissionId" to TextNode(rawProcessedData.submissionId)),
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
                        "dataBecameOpenAt" to dataBecameOpenAt,
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
            ) +
            conditionalMetadata(
                filesFieldNames.isNotEmpty(),
                {
                    val filesWithUrls = buildFileUrls(
                        rawProcessedData.accession,
                        rawProcessedData.version,
                        rawProcessedData.processedData.files ?: emptyMap(),
                    )
                    filesFieldNames.associateWith { NullNode.instance } + filesWithUrls.mapValues { (_, value) ->
                        TextNode(objectMapper.writeValueAsString(value))
                    }
                },
            )

        return ReleasedData(
            metadata = metadata,
            unalignedNucleotideSequences = rawProcessedData.processedData.unalignedNucleotideSequences,
            alignedNucleotideSequences = rawProcessedData.processedData.alignedNucleotideSequences,
            nucleotideInsertions = rawProcessedData.processedData.nucleotideInsertions,
            aminoAcidInsertions = rawProcessedData.processedData.aminoAcidInsertions,
            alignedAminoAcidSequences = rawProcessedData.processedData.alignedAminoAcidSequences,
        )
    }

    private fun buildFileUrls(
        accession: Accession,
        version: Version,
        filesMap: FileCategoryFilesMap,
    ): Map<FileCategory, List<FileIdAndNameAndReadUrl>> = filesMap.mapValues { (category, fileIdandName) ->
        fileIdandName.map { (fileId, name) ->
            val encoded = URLEncoder.encode(name, StandardCharsets.UTF_8)
            val url = when (backendConfig.fileSharing.outputFileUrlType) {
                FileUrlType.WEBSITE -> "${backendConfig.websiteUrl}/seq/$accession.$version/$category/$encoded"
                FileUrlType.BACKEND -> "${backendConfig.backendUrl}/files/get/$accession/$version/$category/$encoded"
                FileUrlType.S3 -> s3Service.getPublicUrl(fileId)
            }
            FileIdAndNameAndReadUrl(fileId, name, url)
        }
    }

    private fun computeDataUseTerm(rawProcessedData: RawProcessedData): DataUseTerms = if (
        rawProcessedData.dataUseTerms is DataUseTerms.Restricted &&
        rawProcessedData.dataUseTerms.restrictedUntil > dateProvider.getCurrentDate()
    ) {
        DataUseTerms.Restricted(rawProcessedData.dataUseTerms.restrictedUntil)
    } else {
        DataUseTerms.Open
    }

    private fun computeDataBecameOpenAt(
        rawProcessedData: RawProcessedData,
        currentDataUseTerms: DataUseTerms,
    ): JsonNode = when {
        currentDataUseTerms is DataUseTerms.Restricted -> NullNode.getInstance()

        rawProcessedData.dataUseTerms is DataUseTerms.Restricted ->
            TextNode(rawProcessedData.dataUseTerms.restrictedUntil.toString())

        rawProcessedData.dataUseTermsChangeDate != null ->
            TextNode(rawProcessedData.dataUseTermsChangeDate.toUtcDateString())

        else -> NullNode.getInstance()
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
