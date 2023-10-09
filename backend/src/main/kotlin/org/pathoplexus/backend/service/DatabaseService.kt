package org.pathoplexus.backend.service

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import io.swagger.v3.oas.annotations.media.Schema
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.toJavaLocalDateTime
import kotlinx.datetime.toInstant
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.QueryParameter
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.booleanParam
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.dateTimeParam
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.stringParam
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.wrapAsExpression
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.model.HeaderId
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.sql.Timestamp
import javax.sql.DataSource
import java.util.UUID

private val log = KotlinLogging.logger { }

@Service
@Transactional
class DatabaseService(
    private val sequenceValidatorService: SequenceValidatorService,
    private val objectMapper: ObjectMapper,
    pool: DataSource,
) {
    init {
        Database.connect(pool)
    }

    fun insertSubmissions(submitter: String, submittedData: List<SubmittedData>): List<HeaderId> {
        log.info { "submitting ${submittedData.size} new sequences by $submitter" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return submittedData.map { data ->
            val insert = SequencesTable.insert {
                it[SequencesTable.submitter] = submitter
                it[submittedAt] = now
                it[version] = 1
                it[status] = Status.RECEIVED.name
                it[customId] = data.customId
                it[originalData] = data.originalData
            }
            HeaderId(insert[SequencesTable.sequenceId], 1, data.customId)
        }
    }

    fun streamUnprocessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.originalData)
            .select(
                where = {
                    (SequencesTable.status eq Status.RECEIVED.name)
                        .and((SequencesTable.version eq maxVersionQuery))
                },
            )
            .limit(numberOfSequences)
            .map {
                UnprocessedData(
                    it[SequencesTable.sequenceId],
                    it[SequencesTable.version],
                    it[SequencesTable.originalData]!!,
                )
            }

        log.info { "streaming ${sequencesData.size} of $numberOfSequences requested unprocessed submissions" }

        updateStatusToProcessing(sequencesData)

        stream(sequencesData, outputStream)
    }

    private fun maxVersionQuery(): Expression<Long?> {
        val subQueryTable = SequencesTable.alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .slice(subQueryTable[SequencesTable.version].max())
                .select { subQueryTable[SequencesTable.sequenceId] eq SequencesTable.sequenceId },
        )
    }

    private fun updateStatusToProcessing(sequences: List<UnprocessedData>) {
        val sequenceVersions = sequences.map { it.sequenceId to it.version }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        SequencesTable
            .update(
                where = { Pair(SequencesTable.sequenceId, SequencesTable.version) inList sequenceVersions },
            ) {
                it[status] = Status.PROCESSING.name
                it[startedProcessingAt] = now
            }
    }

    private fun <T> stream(
        sequencesData: List<T>,
        outputStream: OutputStream,
    ) {
        sequencesData
            .forEach { sequence ->
                val json = objectMapper.writeValueAsString(sequence)
                outputStream.write(json.toByteArray())
                outputStream.write('\n'.code)
                outputStream.flush()
            }
    }

    fun updateProcessedData(inputStream: InputStream): List<ValidationResult> {
        log.info { "updating processed data" }
        val reader = BufferedReader(InputStreamReader(inputStream))

        val validationResults = mutableListOf<ValidationResult>()

        reader.lineSequence().forEach { line ->
            val sequenceVersion = objectMapper.readValue<SequenceVersion>(line)
            val validationResult = sequenceValidatorService.validateSequence(sequenceVersion)

            if (sequenceValidatorService.isValidResult(validationResult)) {
                val numInserted = insertProcessedData(sequenceVersion)
                if (numInserted != 1) {
                    validationResults.add(
                        ValidationResult(
                            sequenceVersion.sequenceId,
                            emptyList(),
                            emptyList(),
                            emptyList(),
                            listOf(insertProcessedDataError(sequenceVersion)),
                        ),
                    )
                }
            } else {
                validationResults.add(validationResult)
            }
        }

        return validationResults
    }

    private fun insertProcessedData(sequenceVersion: SequenceVersion): Int {
        val newStatus = if (sequenceVersion.errors != null &&
            sequenceVersion.errors.isArray &&
            sequenceVersion.errors.size() > 0
        ) {
            Status.NEEDS_REVIEW.name
        } else {
            Status.PROCESSED.name
        }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return SequencesTable.update(
            where = {
                (SequencesTable.sequenceId eq sequenceVersion.sequenceId) and
                    (SequencesTable.version eq sequenceVersion.version) and
                    (SequencesTable.status eq Status.PROCESSING.name)
            },
        ) {
            it[status] = newStatus
            it[processedData] = sequenceVersion.data
            it[errors] = sequenceVersion.errors
            it[warnings] = sequenceVersion.warnings
            it[finishedProcessingAt] = now
        }
    }

    private fun insertProcessedDataError(sequenceVersion: SequenceVersion): String {
        val selectedSequences = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
            )
            .select(
                where = {
                    (SequencesTable.sequenceId eq sequenceVersion.sequenceId) and
                        (SequencesTable.version eq sequenceVersion.version)
                },
            )
        if (selectedSequences.count().toInt() == 0) {
            return "SequenceId does not exist"
        }
        if (selectedSequences.any { it[SequencesTable.status] != Status.PROCESSING.name }) {
            return "SequenceId is not in processing state"
        }
        return "Unknown error"
    }

    fun approveProcessedData(submitter: String, sequenceIds: List<Long>) {
        log.info { "approving ${sequenceIds.size} sequences by $submitter" }

        if (!hasPermissionToChange(submitter, sequenceIds)) {
            throw IllegalArgumentException(
                "User $submitter does not have right to change these sequences ${sequenceIds.size}",
            )
        }

        val maxVersionQuery = maxVersionQuery()

        SequencesTable.update(
            where = {
                (SequencesTable.sequenceId inList sequenceIds) and
                    (SequencesTable.version eq maxVersionQuery) and
                    (SequencesTable.status eq Status.PROCESSED.name)
            },
        ) {
            it[status] = Status.SILO_READY.name
            it[this.submitter] = submitter
        }
    }

    private fun hasPermissionToChange(user: String, sequenceIds: List<Long>): Boolean {
        val maxVersionQuery = maxVersionQuery()
        val sequencesOwnedByUser = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.submitter)
            .select(
                where = {
                    (SequencesTable.sequenceId inList sequenceIds) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.submitter eq user)
                },
            )

        log.error { sequencesOwnedByUser.map { it.toString() } + " " + sequenceIds.size.toLong() }
        return sequencesOwnedByUser.count() == sequenceIds.size.toLong()
    }

    fun streamProcessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        log.info { "streaming $numberOfSequences processed submissions" }
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.processedData,
                SequencesTable.errors,
                SequencesTable.warnings,
            )
            .select(
                where = {
                    (SequencesTable.status eq Status.PROCESSED.name) and
                        (SequencesTable.version eq maxVersionQuery)
                },
            ).limit(numberOfSequences).map { row ->
                SequenceVersion(
                    row[SequencesTable.sequenceId],
                    row[SequencesTable.version],
                    row[SequencesTable.processedData]!!,
                    row[SequencesTable.errors],
                    row[SequencesTable.warnings],
                )
            }

        stream(sequencesData, outputStream)
    }

    fun streamReviewNeededSubmissions(submitter: String, numberOfSequences: Int, outputStream: OutputStream) {
        log.info { "streaming $numberOfSequences submissions that need review by $submitter" }
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.processedData,
                SequencesTable.errors,
                SequencesTable.warnings,
            )
            .select(
                where = {
                    (SequencesTable.status eq Status.NEEDS_REVIEW.name) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.submitter eq submitter)
                },
            ).limit(numberOfSequences).map { row ->
                SequenceVersion(
                    row[SequencesTable.sequenceId],
                    row[SequencesTable.version],
                    row[SequencesTable.processedData]!!,
                    row[SequencesTable.errors],
                    row[SequencesTable.warnings],
                )
            }

        stream(sequencesData, outputStream)
    }

    fun getActiveSequencesSubmittedBy(username: String): List<SequenceVersionStatus> {
        log.info { "getting active sequences submitted by $username" }

        val subTableSequenceStatus = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
                SequencesTable.revoked,
            )

        val maxVersionWithSiloReadyQuery = maxVersionWithSiloReadyQuery()
        val sequencesStatusSiloReady = subTableSequenceStatus
            .select(
                where = {
                    (SequencesTable.status eq Status.SILO_READY.name) and
                        (SequencesTable.submitter eq username) and
                        (SequencesTable.version eq maxVersionWithSiloReadyQuery)
                },
            ).map { row ->
                SequenceVersionStatus(
                    row[SequencesTable.sequenceId],
                    row[SequencesTable.version],
                    Status.SILO_READY,
                    row[SequencesTable.revoked],
                )
            }

        val maxVersionQuery = maxVersionQuery()
        val sequencesStatusNotSiloReady = subTableSequenceStatus.select(
            where = {
                (SequencesTable.status neq Status.SILO_READY.name) and
                    (SequencesTable.submitter eq username) and
                    (SequencesTable.version eq maxVersionQuery)
            },
        ).map { row ->
            SequenceVersionStatus(
                row[SequencesTable.sequenceId],
                row[SequencesTable.version],
                Status.fromString(row[SequencesTable.status]),
                row[SequencesTable.revoked],
            )
        }

        return sequencesStatusSiloReady + sequencesStatusNotSiloReady
    }

    private fun maxVersionWithSiloReadyQuery(): Expression<Long?> {
        val subQueryTable = SequencesTable.alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .slice(subQueryTable[SequencesTable.version].max())
                .select {
                    (subQueryTable[SequencesTable.sequenceId] eq SequencesTable.sequenceId) and
                        (subQueryTable[SequencesTable.status] eq Status.SILO_READY.name)
                },
        )
    }

    fun deleteUserSequences(username: String) {
        SequencesTable.deleteWhere { submitter eq username }
    }

    fun deleteSequences(sequenceIds: List<Long>) {
        SequencesTable.deleteWhere { sequenceId inList sequenceIds }
    }

    fun reviseData(submitter: String, dataSequence: Sequence<FileData>): List<HeaderId> {
        log.info { "revising sequences" }

        val maxVersionQuery = maxVersionQuery()
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return dataSequence.map {
            SequencesTable.insert(
                SequencesTable.slice(
                    SequencesTable.sequenceId,
                    SequencesTable.version.plus(1),
                    SequencesTable.customId,
                    SequencesTable.submitter,
                    dateTimeParam(now),
                    stringParam(Status.RECEIVED.name),
                    booleanParam(false),
                    QueryParameter(it.originalData, SequencesTable.originalData.columnType),
                ).select(
                    where = {
                        (SequencesTable.sequenceId eq it.sequenceId) and
                            (SequencesTable.version eq maxVersionQuery) and
                            (SequencesTable.status eq Status.SILO_READY.name) and
                            (SequencesTable.submitter eq submitter)
                    },
                ),
                columns = listOf(
                    SequencesTable.sequenceId,
                    SequencesTable.version,
                    SequencesTable.customId,
                    SequencesTable.submitter,
                    SequencesTable.submittedAt,
                    SequencesTable.status,
                    SequencesTable.revoked,
                    SequencesTable.originalData,
                ),
            )

            HeaderId(it.sequenceId, it.sequenceId.toInt(), it.customId)
        }.toList()
    }

    fun revokeData(sequenceIds: List<Long>): List<SequenceVersionStatus> {
        log.info { "revoking ${sequenceIds.size} sequences" }

        val maxVersionQuery = maxVersionQuery()
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        SequencesTable.insert(
            SequencesTable.slice(
                SequencesTable.sequenceId,
                SequencesTable.version.plus(1),
                SequencesTable.customId,
                SequencesTable.submitter,
                dateTimeParam(now),
                stringParam(Status.REVOKED_STAGING.name),
                booleanParam(true),
            ).select(
                where = {
                    (SequencesTable.sequenceId inList sequenceIds) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.status eq Status.SILO_READY.name)
                },
            ),
            columns = listOf(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.customId,
                SequencesTable.submitter,
                SequencesTable.submittedAt,
                SequencesTable.status,
                SequencesTable.revoked,
            ),
        )

        val revokedList = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
                SequencesTable.revoked,
            )
            .select(
                where = {
                    (SequencesTable.sequenceId inList sequenceIds) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.status eq Status.REVOKED_STAGING.name)
                },
            ).map {
                SequenceVersionStatus(
                    it[SequencesTable.sequenceId],
                    it[SequencesTable.version],
                    Status.REVOKED_STAGING,
                    it[SequencesTable.revoked],
                )
            }

        return revokedList
    }

    fun confirmRevocation(sequenceIds: List<Long>): Int {
        val maxVersionQuery = maxVersionQuery()

        return SequencesTable.update(
            where = {
                (SequencesTable.sequenceId inList sequenceIds) and
                    (SequencesTable.version eq maxVersionQuery) and
                    (SequencesTable.status eq Status.REVOKED_STAGING.name)
            },
        ) {
            it[status] = Status.SILO_READY.name
        }
    }

        fun submitReviewedSequence(submitter: String, reviewedSequenceVersion: UnprocessedData) {
        log.info { "reviewed sequence submitted $reviewedSequenceVersion" }

        val sequencesReviewed = SequencesTable.update(
            where = {
                (SequencesTable.sequenceId eq reviewedSequenceVersion.sequenceId) and
                    (SequencesTable.version eq reviewedSequenceVersion.version) and
                    (SequencesTable.submitter eq submitter) and
                    (
                        (SequencesTable.status eq Status.PROCESSED.name) or
                            (SequencesTable.status eq Status.NEEDS_REVIEW.name)
                        )
            },
        ) {
            it[status] = Status.REVIEWED.name
            it[originalData] = reviewedSequenceVersion.data
            it[errors] = null
            it[warnings] = null
            it[startedProcessingAt] = null
            it[finishedProcessingAt] = null
            it[processedData] = null
        }

        if (sequencesReviewed != 1) {
            handleReviewedSubmissionError(reviewedSequenceVersion, submitter)
        }
    }

    private fun handleReviewedSubmissionError(reviewedSequenceVersion: UnprocessedData, submitter: String) {
        val selectedSequences = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
                SequencesTable.submitter,
            )
            .select(
                where = {
                    (SequencesTable.sequenceId eq reviewedSequenceVersion.sequenceId) and
                        (SequencesTable.version eq reviewedSequenceVersion.version)
                },
            )

        val sequenceVersionString = "${reviewedSequenceVersion.sequenceId}.${reviewedSequenceVersion.version}"

        if (selectedSequences.count().toInt() == 0) {
            throw UnprocessableEntityException("Sequence $sequenceVersionString does not exist")
        }

        val hasCorrectStatus = selectedSequences.all {
            (it[SequencesTable.status] == Status.PROCESSED.name) ||
                (it[SequencesTable.status] == Status.NEEDS_REVIEW.name)
        }
        if (!hasCorrectStatus) {
            throw UnprocessableEntityException(
                "Sequence $sequenceVersionString is in status ${selectedSequences.first()[SequencesTable.status]} " +
                    "not in ${Status.PROCESSED} or ${Status.NEEDS_REVIEW}",
            )
        }

        if (selectedSequences.any { it[SequencesTable.submitter] != submitter }) {
            throw ForbiddenException(
                "Sequence $sequenceVersionString is not owned by user $submitter",
            )
        }
        throw Exception("SequenceReview: Unknown error")
    }

    // CitationController
    fun createDataset(
        username: String,
        datasetName: String,
        datasetRecords: List<SubmittedDatasetRecord>,
        datasetDescription: String?,
    ): String {
        log.info { "creating dataset ${datasetName}, user ${username}" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val insertedSet = DatasetsTable
            .insert {
                it[name] = datasetName
                it[description] = datasetDescription ?: ""
                it[datasetVersion] = 1
                it[createdAt] = now
                it[createdBy] = username
            }

        for (record in datasetRecords) {
            val insertedRecord = DatasetRecordsTable
                .insert {
                    it[accession] = record.accession
                    it[type] = record.type
                }
            DatasetRecordsToSetsTable
                .insert {
                    it[datasetRecordId] = insertedRecord[DatasetRecordsTable.datasetRecordId]
                    it[datasetId] = insertedSet[DatasetsTable.datasetId]
                    it[datasetVersion] = 1
                }
        }

        return insertedSet[DatasetsTable.datasetId].toString()
    }

    fun updateDataset(
        username: String,
        datasetId: String,
        datasetName: String,
        datasetRecords: List<SubmittedDatasetRecord>,
        datasetDescription: String?,
    ) {
        log.info { "updating dataset ${datasetName}, user ${username}" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val maxVersion = DatasetsTable
            .slice(DatasetsTable.datasetVersion.max())
            .select { DatasetsTable.datasetId eq UUID.fromString(datasetId)  }
            .singleOrNull()

        if (maxVersion == null) {
            throw IllegalArgumentException("Dataset set $datasetId does not exist")
        }

        val version = maxVersion[DatasetsTable.datasetVersion] + 1

        val insertedSet = DatasetsTable
            .insert {
                it[name] = datasetName
                it[description] = datasetDescription ?: ""
                it[datasetVersion] = version
                it[createdAt] = now
                it[createdBy] = username
            }

        for (record in datasetRecords) {
            val existingRecord = DatasetRecordsTable
                .select { DatasetRecordsTable.accession eq record.accession }
                .singleOrNull()

            var datasetRecordId: Long

            if (existingRecord == null) {
                val insertedRecord = DatasetRecordsTable
                    .insert {
                        it[accession] = record.accession
                        it[type] = record.type
                    }
                datasetRecordId = insertedRecord[DatasetRecordsTable.datasetRecordId]
            } else {
                datasetRecordId = existingRecord[DatasetRecordsTable.datasetRecordId]
            }

            DatasetRecordsToSetsTable
                .insert {
                    it[DatasetRecordsToSetsTable.datasetVersion] = version
                    it[DatasetRecordsToSetsTable.datasetId] = insertedSet[DatasetsTable.datasetId]
                    it[DatasetRecordsToSetsTable.datasetRecordId] = datasetRecordId
                }
        }
    }

    fun getDataSet(datasetId: String, version: Long?): List<Dataset> {
        var datasetList = mutableListOf<Dataset>()

        if (version == null) {
            var selectedDatasets = DatasetsTable
                .select{
                    DatasetsTable.datasetId eq UUID.fromString(datasetId)
                }
            selectedDatasets.forEach {
                datasetList.add(Dataset(
                    it[DatasetsTable.datasetId],
                    it[DatasetsTable.datasetVersion],
                    it[DatasetsTable.name],
                    it[DatasetsTable.description],
                    Timestamp.valueOf(it[DatasetsTable.createdAt].toJavaLocalDateTime()),
                    it[DatasetsTable.createdBy],
                ))
            }
        }
        else {
            var selectedDataset = DatasetsTable
                .select{
                    (DatasetsTable.datasetId eq UUID.fromString(datasetId)) and
                    (DatasetsTable.datasetVersion eq version)
                }.singleOrNull()

            if (selectedDataset == null) {
                throw IllegalArgumentException("Dataset set $datasetId does not exist")
            }

            datasetList.add(Dataset(
                selectedDataset[DatasetsTable.datasetId],
                selectedDataset[DatasetsTable.datasetVersion],
                selectedDataset[DatasetsTable.name],
                selectedDataset[DatasetsTable.description],
                Timestamp.valueOf(selectedDataset[DatasetsTable.createdAt].toJavaLocalDateTime()),
                selectedDataset[DatasetsTable.createdBy]
            ))
        }
        return datasetList
    }

    fun getDatasetRecords(datasetId: String, version: Long?): List<DatasetRecord> {
        var selectedVersion = version
        if (selectedVersion == null) {
            selectedVersion = DatasetsTable
                .slice(DatasetsTable.datasetVersion.max())
                .select { DatasetsTable.datasetId eq UUID.fromString(datasetId)  }
                .singleOrNull()?.get(DatasetsTable.datasetVersion)
        }
        if (selectedVersion == null) {
            throw IllegalArgumentException("Dataset set $datasetId does not exist")
        }

        var datasetRecordList = mutableListOf<DatasetRecord>()

        var selectedDatasetRecords = DatasetRecordsToSetsTable
            .innerJoin(DatasetRecordsTable)
            .select{
                (DatasetRecordsToSetsTable.datasetId eq UUID.fromString(datasetId)) and
                (DatasetRecordsToSetsTable.datasetVersion eq selectedVersion)
            }
            .map {
                DatasetRecord(
                    it[DatasetRecordsTable.datasetRecordId],
                    it[DatasetRecordsTable.accession],
                    it[DatasetRecordsTable.type],
                )
            }

        return datasetRecordList
    }

    fun getDatasets(username: String): List<Dataset> {
        var datasetList = mutableListOf<Dataset>()
        var selectedDatasets = DatasetsTable
            .select{ DatasetsTable.createdBy eq username }

        selectedDatasets.forEach {
            datasetList.add(Dataset(
                it[DatasetsTable.datasetId],
                it[DatasetsTable.datasetVersion],
                it[DatasetsTable.name],
                it[DatasetsTable.description],
                Timestamp.valueOf(it[DatasetsTable.createdAt].toJavaLocalDateTime()),
                it[DatasetsTable.createdBy],
            ))
        }
        return datasetList
    }

    fun deleteDataset(username: String, _datasetId: String) {
        DatasetsTable.deleteWhere { datasetId eq UUID.fromString(_datasetId) }
    }

    fun createCitation(_data: String, _type: String): Long {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val insert = CitationsTable
            .insert {
                it[data] = _data
                it[type] = _type
                it[createdAt] = now
                it[createdBy] = "nobody"
                it[updatedAt] = now
                it[updatedBy] = "nobody"
            }

        return insert[CitationsTable.citationId]
    }

    fun getCitation(citationId: Long): List<Citation> {
        var citationList = mutableListOf<Citation>()
        var selectedCitations = CitationsTable
            .select(
                where = { CitationsTable.citationId eq citationId }
            )
        var selectedCitation = selectedCitations.single()
        citationList.add(Citation(
            selectedCitation[CitationsTable.citationId],
            selectedCitation[CitationsTable.data],
            selectedCitation[CitationsTable.type],
            Timestamp.valueOf(selectedCitation[CitationsTable.createdAt].toJavaLocalDateTime()),
            selectedCitation[CitationsTable.createdBy],
            Timestamp.valueOf(selectedCitation[CitationsTable.updatedAt].toJavaLocalDateTime()),
            selectedCitation[CitationsTable.updatedBy]
        ))

        return citationList
    }

    fun updateCitation(citationId: Long, _data: String, _type: String) {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        CitationsTable
            .update(
                where = { CitationsTable.citationId eq citationId }
            ) {
                it[data] = _data
                it[type] = _type
                it[updatedAt] = now
                it[updatedBy] = "nobody"
            }
    }

    fun deleteCitation(_citationId: Long) {
        CitationsTable.deleteWhere { citationId eq _citationId }
    }

    fun createAuthor(_affiliation: String, _email: String, _name: String): Long {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val insert = AuthorsTable
            .insert {
                it[affiliation] = _affiliation
                it[email] = _email
                it[name] = _name
                it[createdAt] = now
                it[createdBy] = "nobody"
                it[updatedAt] = now
                it[updatedBy] = "nobody"
            }

        return insert[AuthorsTable.authorId]
    }

    fun getAuthor(authorId: Long): List<Author> {
        var authorList = mutableListOf<Author>()
        var selectedAuthors = AuthorsTable
            .select(
                where = { AuthorsTable.authorId eq authorId }
            )
        var selectedAuthor = selectedAuthors.single()
        authorList.add(Author(
            selectedAuthor[AuthorsTable.authorId],
            selectedAuthor[AuthorsTable.affiliation],
            selectedAuthor[AuthorsTable.email],
            selectedAuthor[AuthorsTable.name],
            Timestamp.valueOf(selectedAuthor[AuthorsTable.createdAt].toJavaLocalDateTime()),
            selectedAuthor[AuthorsTable.createdBy],
            Timestamp.valueOf(selectedAuthor[AuthorsTable.updatedAt].toJavaLocalDateTime()),
            selectedAuthor[AuthorsTable.updatedBy]
        ))
        return authorList
    }

    fun updateAuthor(authorId: Long, _affiliation: String, _email: String, _name: String) {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        AuthorsTable
            .update(
                where = { AuthorsTable.authorId eq authorId }
            ) {
                it[affiliation] = _affiliation
                it[email] = _email
                it[name] = _name
                it[updatedAt] = now
                it[updatedBy] = "nobody"
            }
    }

    fun deleteAuthor(_authorId: Long) {
        AuthorsTable.deleteWhere { authorId eq _authorId }
    }
}

data class SequenceVersion(
    val sequenceId: Long,
    val version: Long,
    val data: JsonNode,
    val errors: JsonNode? = null,
    val warnings: JsonNode? = null,
)

data class SequenceVersionStatus(
    val sequenceId: Long,
    val version: Long,
    val status: Status,
    val revoked: Boolean = false,
)

data class FileData(
    val customId: String,
    val sequenceId: Long,
    val originalData: OriginalData,
)

data class SubmittedData(
    val customId: String,
    val originalData: OriginalData,
)

data class UnprocessedData(
    @Schema(example = "123") val sequenceId: Long,
    @Schema(example = "1") val version: Long,
    val data: OriginalData,
)

data class OriginalData(
    @Schema(
        example = "{\"date\": \"2020-01-01\", \"country\": \"Germany\"}",
        description = "Key value pairs of metadata, as submitted in the metadata file",
    )
    val metadata: Map<String, String>,
    @Schema(
        example = "{\"segment1\": \"ACTG\", \"segment2\": \"GTCA\"}",
        description = "The key is the segment name, the value is the nucleotide sequence",
    )
    val unalignedNucleotideSequences: Map<String, String>,
)

enum class Status {
    @JsonProperty("RECEIVED")
    RECEIVED,

    @JsonProperty("PROCESSING")
    PROCESSING,

    @JsonProperty("NEEDS_REVIEW")
    NEEDS_REVIEW,

    @JsonProperty("REVIEWED")
    REVIEWED,

    @JsonProperty("PROCESSED")
    PROCESSED,

    @JsonProperty("SILO_READY")
    SILO_READY,

    @JsonProperty("REVOKED_STAGING")
    REVOKED_STAGING,

    ;

    companion object {
        private val stringToEnumMap: Map<String, Status> = entries.associateBy { it.name }

        fun fromString(statusString: String): Status {
            return stringToEnumMap[statusString]
                ?: throw IllegalArgumentException("Unknown status: $statusString")
        }
    }
}

// CitationController

data class SubmittedDatasetRecord(
    val accession: String,
    val type: String,
)

data class SubmittedDataset(
    val name: String,
    val description: String,
    val records: List<SubmittedDatasetRecord>,
)

data class DatasetRecord(
    val datasetRecordId: Long,
    val accession: String,
    val type: String,
)

data class Dataset(
    val datasetId: UUID,
    val datasetVersion: Long,
    val name: String,
    val description: String? = null,
    val createdAt: Timestamp,
    val createdBy: String,
)

data class Citation(
    val citationId: Long,
    val data: String,
    val type: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val updatedAt: Timestamp,
    val updatedBy: String,
)

data class Author(
    val authorId: Long,
    val affiliation: String,
    val email: String,
    val name: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val updatedAt: Timestamp,
    val updatedBy: String,
)