package org.loculus.backend.service.submission

import com.fasterxml.jackson.core.JacksonException
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Count
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.case
import org.jetbrains.exposed.sql.SqlExpressionBuilder.less
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.Transaction
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.booleanParam
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.json.extract
import org.jetbrains.exposed.sql.kotlin.datetime.dateTimeParam
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.not
import org.jetbrains.exposed.sql.notExists
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.stringLiteral
import org.jetbrains.exposed.sql.stringParam
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.AccessionVersionOriginalMetadata
import org.loculus.backend.api.ApproveDataScope
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.DeleteSequenceScope
import org.loculus.backend.api.EditedSequenceEntryData
import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.GetSequenceResponse
import org.loculus.backend.api.Organism
import org.loculus.backend.api.PreprocessingStatus
import org.loculus.backend.api.PreprocessingStatus.IN_PROCESSING
import org.loculus.backend.api.PreprocessingStatus.PROCESSED
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.ProcessingResult.HAS_ERRORS
import org.loculus.backend.api.ProcessingResult.HAS_WARNINGS
import org.loculus.backend.api.ProcessingResult.NO_ISSUES
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.SequenceEntryVersionToEdit
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.ProcessingValidationException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.loculus.backend.service.groupmanagement.GroupEntity
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.Version
import org.loculus.backend.utils.toTimestamp
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.util.Locale
import javax.sql.DataSource
import kotlin.sequences.Sequence

private val log = KotlinLogging.logger { }

@Service
@Transactional
class SubmissionDatabaseService(
    private val processedSequenceEntryValidatorFactory: ProcessedSequenceEntryValidatorFactory,
    private val externalMetadataValidatorFactory: ExternalMetadataValidatorFactory,
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val groupManagementDatabaseService: GroupManagementDatabaseService,
    private val objectMapper: ObjectMapper,
    pool: DataSource,
    private val emptyProcessedDataProvider: EmptyProcessedDataProvider,
    private val compressionService: CompressionService,
    private val auditLogger: AuditLogger,
    private val dateProvider: DateProvider,
    @Value("\${${BackendSpringProperty.STREAM_BATCH_SIZE}}") private val streamBatchSize: Int,
) {

    init {
        Database.connect(pool)
    }

    fun streamUnprocessedSubmissions(
        numberOfSequenceEntries: Int,
        organism: Organism,
        pipelineVersion: Long,
    ): Sequence<UnprocessedData> {
        log.info { "Request received to stream up to $numberOfSequenceEntries unprocessed submissions for $organism." }

        return fetchUnprocessedEntriesAndUpdateToInProcessing(
            organism,
            numberOfSequenceEntries,
            pipelineVersion,
        )
    }

    fun getCurrentProcessingPipelineVersion(): Long {
        val table = CurrentProcessingPipelineTable
        return table
            .select(table.versionColumn)
            .map {
                it[table.versionColumn]
            }
            .first()
    }

    private fun fetchUnprocessedEntriesAndUpdateToInProcessing(
        organism: Organism,
        numberOfSequenceEntries: Int,
        pipelineVersion: Long,
    ): Sequence<UnprocessedData> {
        val table = SequenceEntriesTable
        val preprocessing = SequenceEntriesPreprocessedDataTable

        return table
            .select(
                table.accessionColumn,
                table.versionColumn,
                table.originalDataColumn,
                table.submissionIdColumn,
                table.submitterColumn,
                table.groupIdColumn,
                table.submittedAtTimestampColumn,
            )
            .where {
                table.organismIs(organism) and
                    not(table.isRevocationColumn) and
                    notExists(
                        preprocessing.selectAll().where {
                            (table.accessionColumn eq preprocessing.accessionColumn) and
                                (table.versionColumn eq preprocessing.versionColumn) and
                                (preprocessing.pipelineVersionColumn eq pipelineVersion)
                        },
                    )
            }
            .orderBy(table.accessionColumn)
            .limit(numberOfSequenceEntries)
            .fetchSize(streamBatchSize)
            .asSequence()
            .chunked(streamBatchSize)
            .map { chunk ->
                val chunkOfUnprocessedData = chunk.map {
                    UnprocessedData(
                        accession = it[table.accessionColumn],
                        version = it[table.versionColumn],
                        data = compressionService.decompressSequencesInOriginalData(
                            it[table.originalDataColumn]!!,
                            organism,
                        ),
                        submissionId = it[table.submissionIdColumn],
                        submitter = it[table.submitterColumn],
                        groupId = it[table.groupIdColumn],
                        submittedAt = it[table.submittedAtTimestampColumn].toTimestamp(),
                    )
                }
                updateStatusToProcessing(chunkOfUnprocessedData, pipelineVersion)
                chunkOfUnprocessedData
            }
            .flatten()
    }

    private fun updateStatusToProcessing(sequenceEntries: List<UnprocessedData>, pipelineVersion: Long) {
        log.info { "updating status to processing. Number of sequence entries: ${sequenceEntries.size}" }

        SequenceEntriesPreprocessedDataTable.batchInsert(sequenceEntries) {
            this[SequenceEntriesPreprocessedDataTable.accessionColumn] = it.accession
            this[SequenceEntriesPreprocessedDataTable.versionColumn] = it.version
            this[SequenceEntriesPreprocessedDataTable.pipelineVersionColumn] = pipelineVersion
            this[SequenceEntriesPreprocessedDataTable.processingStatusColumn] = IN_PROCESSING.name
            this[SequenceEntriesPreprocessedDataTable.startedProcessingAtColumn] = dateProvider.getCurrentDateTime()
        }
    }

    fun updateProcessedData(inputStream: InputStream, organism: Organism, pipelineVersion: Long) {
        log.info { "updating processed data" }
        val reader = BufferedReader(InputStreamReader(inputStream))

        val statusByAccessionVersion = mutableMapOf<String, PreprocessingStatus>()
        reader.lineSequence().forEach { line ->
            val submittedProcessedData = try {
                objectMapper.readValue<SubmittedProcessedData>(line)
            } catch (e: JacksonException) {
                throw BadRequestException("Failed to deserialize NDJSON line: ${e.message}", e)
            }

            val newStatus = insertProcessedDataWithStatus(submittedProcessedData, organism, pipelineVersion)

            statusByAccessionVersion[submittedProcessedData.displayAccessionVersion()] = newStatus
        }

        log.info("Updated ${statusByAccessionVersion.size} sequences to $PROCESSED")

        auditLogger.log(
            username = "<pipeline version $pipelineVersion>",
            description = "Processed ${statusByAccessionVersion.size} sequences: " +
                statusByAccessionVersion.keys.joinToString(),
        )
    }

    fun updateExternalMetadata(inputStream: InputStream, organism: Organism, externalMetadataUpdater: String) {
        log.info { "Updating metadata with external metadata received from $externalMetadataUpdater" }
        val reader = BufferedReader(InputStreamReader(inputStream))

        val accessionVersions = mutableListOf<String>()
        reader.lineSequence().forEach { line ->
            val submittedExternalMetadata =
                try {
                    objectMapper.readValue<ExternalSubmittedData>(line)
                } catch (e: JacksonException) {
                    throw BadRequestException(
                        "Failed to deserialize NDJSON line: ${e.message}",
                        e,
                    )
                }
            accessionVersions.add(submittedExternalMetadata.displayAccessionVersion())

            insertExternalMetadata(
                submittedExternalMetadata,
                organism,
                externalMetadataUpdater,
            )
        }

        auditLogger.log(
            description = (
                "Updated external metadata of ${accessionVersions.size} sequences:" +
                    accessionVersions.joinToString()
                ),
            username = externalMetadataUpdater,
        )
    }

    private fun insertExternalMetadata(
        submittedExternalMetadata: ExternalSubmittedData,
        organism: Organism,
        externalMetadataUpdater: String,
    ) {
        accessionPreconditionValidator.validate {
            thatAccessionVersionExists(submittedExternalMetadata)
                .andThatSequenceEntriesAreInStates(
                    listOf(Status.APPROVED_FOR_RELEASE),
                )
                .andThatOrganismIs(organism)
        }
        validateExternalMetadata(
            submittedExternalMetadata,
            organism,
            externalMetadataUpdater,
        )

        val numberInserted =
            ExternalMetadataTable.update(
                where = {
                    (ExternalMetadataTable.accessionColumn eq submittedExternalMetadata.accession) and
                        (ExternalMetadataTable.versionColumn eq submittedExternalMetadata.version) and
                        (ExternalMetadataTable.updaterIdColumn eq externalMetadataUpdater)
                },
            ) {
                it[accessionColumn] = submittedExternalMetadata.accession
                it[versionColumn] = submittedExternalMetadata.version
                it[updaterIdColumn] = externalMetadataUpdater
                it[externalMetadataColumn] = submittedExternalMetadata.externalMetadata
                it[updatedAtColumn] = dateProvider.getCurrentDateTime()
            }

        if (numberInserted != 1) {
            ExternalMetadataTable.insert {
                it[accessionColumn] = submittedExternalMetadata.accession
                it[versionColumn] = submittedExternalMetadata.version
                it[updaterIdColumn] = externalMetadataUpdater
                it[externalMetadataColumn] = submittedExternalMetadata.externalMetadata
                it[updatedAtColumn] = dateProvider.getCurrentDateTime()
            }
        }
    }

    private fun insertProcessedDataWithStatus(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
        pipelineVersion: Long,
    ): PreprocessingStatus {
        val submittedErrors = submittedProcessedData.errors.orEmpty()
        val submittedWarnings = submittedProcessedData.warnings.orEmpty()
        val newStatus = PROCESSED
        val processedData = when {
            submittedErrors.isEmpty() -> postProcessAndValidateProcessedData(submittedProcessedData, organism)
            else -> submittedProcessedData.data
        }

        val table = SequenceEntriesPreprocessedDataTable
        val numberInserted =
            table.update(
                where = {
                    table.accessionVersionEquals(submittedProcessedData) and
                        table.statusIs(IN_PROCESSING) and
                        (table.pipelineVersionColumn eq pipelineVersion)
                },
            ) {
                it[processingStatusColumn] = newStatus.name
                it[processedDataColumn] = compressionService.compressSequencesInProcessedData(processedData, organism)
                it[errorsColumn] = submittedErrors
                it[warningsColumn] = submittedWarnings
                it[finishedProcessingAtColumn] = dateProvider.getCurrentDateTime()
            }

        if (numberInserted != 1) {
            throwInsertFailedException(submittedProcessedData, pipelineVersion)
        }

        return newStatus
    }

    private fun postProcessAndValidateProcessedData(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
    ) = try {
        throwIfIsSubmissionForWrongOrganism(submittedProcessedData, organism)
        val processedData = makeSequencesUpperCase(submittedProcessedData.data)
        processedSequenceEntryValidatorFactory.create(organism).validate(processedData)
    } catch (validationException: ProcessingValidationException) {
        throw validationException
    }

    private fun makeSequencesUpperCase(processedData: ProcessedData<GeneticSequence>) = processedData.copy(
        unalignedNucleotideSequences = processedData.unalignedNucleotideSequences.mapValues { (_, it) ->
            it?.uppercase(Locale.US)
        },
        alignedNucleotideSequences = processedData.alignedNucleotideSequences.mapValues { (_, it) ->
            it?.uppercase(Locale.US)
        },
        alignedAminoAcidSequences = processedData.alignedAminoAcidSequences.mapValues { (_, it) ->
            it?.uppercase(Locale.US)
        },
        nucleotideInsertions = processedData.nucleotideInsertions.mapValues { (_, it) ->
            it.map { insertion -> insertion.copy(sequence = insertion.sequence.uppercase(Locale.US)) }
        },
        aminoAcidInsertions = processedData.aminoAcidInsertions.mapValues { (_, it) ->
            it.map { insertion -> insertion.copy(sequence = insertion.sequence.uppercase(Locale.US)) }
        },
    )

    private fun validateExternalMetadata(
        externalSubmittedData: ExternalSubmittedData,
        organism: Organism,
        externalMetadataUpdater: String,
    ) = externalMetadataValidatorFactory
        .create(organism)
        .validate(externalSubmittedData.externalMetadata, externalMetadataUpdater)

    private fun throwIfIsSubmissionForWrongOrganism(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
    ) {
        val resultRow = SequenceEntriesView
            .select(SequenceEntriesView.organismColumn)
            .where { SequenceEntriesView.accessionVersionEquals(submittedProcessedData) }
            .firstOrNull() ?: return

        if (resultRow[SequenceEntriesView.organismColumn] != organism.name) {
            throw UnprocessableEntityException(
                "Accession version ${submittedProcessedData.displayAccessionVersion()} is for organism " +
                    "${resultRow[SequenceEntriesView.organismColumn]}, " +
                    "but submitted data is for organism ${organism.name}",
            )
        }
    }

    private fun throwInsertFailedException(submittedProcessedData: SubmittedProcessedData, pipelineVersion: Long) {
        val preprocessing = SequenceEntriesPreprocessedDataTable
        val selectedSequenceEntries = preprocessing
            .select(
                preprocessing.accessionColumn,
                preprocessing.versionColumn,
                preprocessing.processingStatusColumn,
                preprocessing.pipelineVersionColumn,
            )
            .where { preprocessing.accessionVersionEquals(submittedProcessedData) }

        val accessionVersion = submittedProcessedData.displayAccessionVersion()
        if (selectedSequenceEntries.all {
                it[preprocessing.processingStatusColumn] != IN_PROCESSING.name
            }
        ) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion does not exist or is not awaiting any processing results",
            )
        }
        if (selectedSequenceEntries.all { it[preprocessing.pipelineVersionColumn] != pipelineVersion }) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion is not awaiting processing results of version " +
                    "$pipelineVersion (anymore)",
            )
        }
        throw IllegalStateException(
            "Update processed data: Unexpected error for accession versions $accessionVersion",
        )
    }

    private fun getGroupCondition(groupIdsFilter: List<Int>?, authenticatedUser: AuthenticatedUser): Op<Boolean> =
        if (groupIdsFilter != null) {
            groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroups(
                groupIdsFilter,
                authenticatedUser,
            )
            SequenceEntriesView.groupIsOneOf(groupIdsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            SequenceEntriesView.groupIsOneOf(groupManagementDatabaseService.getGroupIdsOfUser(authenticatedUser))
        }

    fun approveProcessedData(
        authenticatedUser: AuthenticatedUser,
        accessionVersionsFilter: List<AccessionVersion>?,
        submitterNamesFilter: List<String>?,
        groupIdsFilter: List<Int>?,
        organism: Organism,
        scope: ApproveDataScope,
    ): List<AccessionVersion> {
        if (accessionVersionsFilter == null) {
            log.info { "approving all sequences by all groups ${authenticatedUser.username} is member of" }
        } else {
            log.info { "approving ${accessionVersionsFilter.size} sequences by ${authenticatedUser.username}" }
        }

        if (accessionVersionsFilter != null) {
            accessionPreconditionValidator.validate {
                thatAccessionVersionsExist(accessionVersionsFilter)
                    .andThatOrganismIs(organism)
                    .andThatSequenceEntriesAreInStates(listOf(Status.PROCESSED))
                    .andThatSequenceEntriesHaveNoErrors()
                    .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
            }
        }

        val statusCondition = SequenceEntriesView.statusIs(Status.PROCESSED)

        val accessionCondition = if (accessionVersionsFilter !== null) {
            SequenceEntriesView.accessionVersionIsIn(accessionVersionsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            SequenceEntriesView.groupIsOneOf(groupManagementDatabaseService.getGroupIdsOfUser(authenticatedUser))
        }

        val includedProcessingResults = mutableListOf(NO_ISSUES)
        if (scope == ApproveDataScope.ALL) {
            includedProcessingResults.add(HAS_WARNINGS)
        }
        val scopeCondition = SequenceEntriesView.processingResultIsOneOf(includedProcessingResults)

        val groupCondition = getGroupCondition(groupIdsFilter, authenticatedUser)

        val submitterCondition = if (submitterNamesFilter !== null) {
            SequenceEntriesView.submitterIsOneOf(submitterNamesFilter)
        } else {
            Op.TRUE
        }

        val organismCondition = SequenceEntriesView.organismIs(organism)

        val accessionVersionsToUpdate = SequenceEntriesView
            .selectAll()
            .where {
                statusCondition and accessionCondition and scopeCondition and groupCondition and
                    organismCondition and submitterCondition
            }
            .map { AccessionVersion(it[SequenceEntriesView.accessionColumn], it[SequenceEntriesView.versionColumn]) }

        if (accessionVersionsToUpdate.isEmpty()) {
            return emptyList()
        }

        val now = dateProvider.getCurrentDateTime()
        for (accessionVersionsChunk in accessionVersionsToUpdate.chunked(1000)) {
            SequenceEntriesTable.update(
                where = {
                    SequenceEntriesTable.accessionVersionIsIn(accessionVersionsChunk)
                },
            ) {
                it[releasedAtTimestampColumn] = now
                it[approverColumn] = authenticatedUser.username
            }
        }

        auditLogger.log(
            authenticatedUser.username,
            "Approved ${accessionVersionsToUpdate.size} sequences: " +
                accessionVersionsToUpdate.joinToString { it.displayAccessionVersion() },
        )

        return accessionVersionsToUpdate
    }

    fun getLatestVersions(organism: Organism): Map<Accession, Version> {
        val maxVersionExpression = SequenceEntriesView.versionColumn.max()
        return SequenceEntriesView
            .select(SequenceEntriesView.accessionColumn, maxVersionExpression)
            .where {
                SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and SequenceEntriesView.organismIs(
                    organism,
                )
            }
            .groupBy(SequenceEntriesView.accessionColumn)
            .associate { it[SequenceEntriesView.accessionColumn] to it[maxVersionExpression]!! }
    }

    fun getLatestRevocationVersions(organism: Organism): Map<Accession, Version> {
        val maxVersionExpression = SequenceEntriesView.versionColumn.max()

        return SequenceEntriesView.select(SequenceEntriesView.accessionColumn, maxVersionExpression)
            .where {
                SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and
                    (SequenceEntriesView.isRevocationColumn eq true) and
                    SequenceEntriesView.organismIs(organism)
            }
            .groupBy(SequenceEntriesView.accessionColumn)
            .associate { it[SequenceEntriesView.accessionColumn] to it[maxVersionExpression]!! }
    }

    // Make sure to keep in sync with streamReleasedSubmissions query
    fun countReleasedSubmissions(organism: Organism): Long = SequenceEntriesView.select(
        SequenceEntriesView.accessionColumn,
    ).where {
        SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and SequenceEntriesView.organismIs(
            organism,
        )
    }.count()

    // Make sure to keep in sync with countReleasedSubmissions query
    fun streamReleasedSubmissions(organism: Organism): Sequence<RawProcessedData> = SequenceEntriesView.join(
        DataUseTermsTable,
        JoinType.LEFT,
        additionalConstraint = {
            (SequenceEntriesView.accessionColumn eq DataUseTermsTable.accessionColumn) and
                (DataUseTermsTable.isNewestDataUseTerms)
        },
    )
        .select(
            SequenceEntriesView.accessionColumn,
            SequenceEntriesView.versionColumn,
            SequenceEntriesView.isRevocationColumn,
            SequenceEntriesView.versionCommentColumn,
            SequenceEntriesView.jointDataColumn,
            SequenceEntriesView.submitterColumn,
            SequenceEntriesView.groupIdColumn,
            SequenceEntriesView.submittedAtTimestampColumn,
            SequenceEntriesView.releasedAtTimestampColumn,
            SequenceEntriesView.submissionIdColumn,
            DataUseTermsTable.dataUseTermsTypeColumn,
            DataUseTermsTable.restrictedUntilColumn,
        )
        .where {
            SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and SequenceEntriesView.organismIs(
                organism,
            )
        }
        .orderBy(
            SequenceEntriesView.accessionColumn to SortOrder.ASC,
            SequenceEntriesView.versionColumn to SortOrder.ASC,
        )
        .fetchSize(streamBatchSize)
        .asSequence()
        .map {
            RawProcessedData(
                accession = it[SequenceEntriesView.accessionColumn],
                version = it[SequenceEntriesView.versionColumn],
                isRevocation = it[SequenceEntriesView.isRevocationColumn],
                submitter = it[SequenceEntriesView.submitterColumn],
                groupId = it[SequenceEntriesView.groupIdColumn],
                groupName = GroupEntity[it[SequenceEntriesView.groupIdColumn]].groupName,
                submissionId = it[SequenceEntriesView.submissionIdColumn],
                processedData = when (val processedData = it[SequenceEntriesView.jointDataColumn]) {
                    null -> emptyProcessedDataProvider.provide(organism)
                    else -> compressionService.decompressSequencesInProcessedData(processedData, organism)
                },
                submittedAtTimestamp = it[SequenceEntriesView.submittedAtTimestampColumn],
                releasedAtTimestamp = it[SequenceEntriesView.releasedAtTimestampColumn]!!,
                dataUseTerms = DataUseTerms.fromParameters(
                    DataUseTermsType.fromString(it[DataUseTermsTable.dataUseTermsTypeColumn]),
                    it[DataUseTermsTable.restrictedUntilColumn],
                ),
                versionComment = it[SequenceEntriesView.versionCommentColumn],
            )
        }

    /**
     * Returns a list of sequences matching the given filters, which is also paginated.
     * Also returns status counts and processing result counts.
     * Note that the counts are _not_ affected by the pagination, status or warning filter;
     * i.e. the counts are for all sequences from that group and organism.
     */
    fun getSequences(
        authenticatedUser: AuthenticatedUser,
        organism: Organism? = null,
        groupIdsFilter: List<Int>? = null,
        statusesFilter: List<Status>? = null,
        processingResultFilter: List<ProcessingResult>? = null,
        page: Int? = null,
        size: Int? = null,
    ): GetSequenceResponse {
        log.info {
            "getting sequence for user ${authenticatedUser.username} " +
                "(groupFilter: $groupIdsFilter in statuses $statusesFilter)." +
                " Page $page of size $size "
        }

        val listOfStatuses = statusesFilter ?: Status.entries

        val groupCondition = getGroupCondition(groupIdsFilter, authenticatedUser)

        val baseQuery = SequenceEntriesView
            .join(
                DataUseTermsTable,
                JoinType.LEFT,
                additionalConstraint = {
                    (SequenceEntriesView.accessionColumn eq DataUseTermsTable.accessionColumn) and
                        (DataUseTermsTable.isNewestDataUseTerms)
                },
            )
            .select(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submissionIdColumn,
                SequenceEntriesView.statusColumn,
                SequenceEntriesView.isRevocationColumn,
                SequenceEntriesView.groupIdColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.organismColumn,
                SequenceEntriesView.submittedAtTimestampColumn,
                SequenceEntriesView.errorsColumn,
                SequenceEntriesView.warningsColumn,
                SequenceEntriesView.processingResultColum,
                DataUseTermsTable.dataUseTermsTypeColumn,
                DataUseTermsTable.restrictedUntilColumn,
            )
            .where { groupCondition }
            .orderBy(SequenceEntriesView.accessionColumn)

        if (organism != null) {
            baseQuery.andWhere { SequenceEntriesView.organismIs(organism) }
        }

        val statusCounts: Map<Status, Int> = Status.entries.associateWith { status ->
            baseQuery.count { it[SequenceEntriesView.statusColumn] == status.name }
        }

        val filteredQuery = baseQuery.andWhere {
            SequenceEntriesView.statusIsOneOf(listOfStatuses)
        }

        processingResultFilter?.let { processingResultsToInclude ->
            filteredQuery.andWhere {
                SequenceEntriesView.processingResultIsOneOf(processingResultsToInclude) or
                    not(SequenceEntriesView.statusIs(Status.PROCESSED))
            }
        }

        val pagedQuery = if (page != null && size != null) {
            filteredQuery.limit(size).offset((page * size).toLong())
        } else {
            filteredQuery
        }

        val entries = pagedQuery
            .map { row ->
                SequenceEntryStatus(
                    accession = row[SequenceEntriesView.accessionColumn],
                    version = row[SequenceEntriesView.versionColumn],
                    status = Status.fromString(row[SequenceEntriesView.statusColumn]),
                    processingResult = if (row[SequenceEntriesView.processingResultColum] !=
                        null
                    ) {
                        ProcessingResult.fromString(row[SequenceEntriesView.processingResultColum])
                    } else {
                        null
                    },
                    groupId = row[SequenceEntriesView.groupIdColumn],
                    submitter = row[SequenceEntriesView.submitterColumn],
                    isRevocation = row[SequenceEntriesView.isRevocationColumn],
                    submissionId = row[SequenceEntriesView.submissionIdColumn],
                    dataUseTerms = DataUseTerms.fromParameters(
                        DataUseTermsType.fromString(row[DataUseTermsTable.dataUseTermsTypeColumn]),
                        row[DataUseTermsTable.restrictedUntilColumn],
                    ),
                    hasErrors = row[SequenceEntriesView.errorsColumn].orEmpty().isNotEmpty(),
                    hasWarnings = row[SequenceEntriesView.warningsColumn].orEmpty().isNotEmpty(),
                )
            }

        val processingResultCounts = getProcessingResultCounts(groupIdsFilter, authenticatedUser, organism)

        return GetSequenceResponse(
            sequenceEntries = entries,
            statusCounts = statusCounts,
            processingResultCounts = processingResultCounts,
        )
    }

    /**
     * How many processing results have errors, just warnings, or none?
     * Considers only SequenceEntries that are PROCESSED.
     */
    private fun getProcessingResultCounts(
        groupIdsFilter: List<Int>?,
        authenticatedUser: AuthenticatedUser,
        organism: Organism?,
    ): Map<ProcessingResult, Int> {
        val processingResultColum = SequenceEntriesView.processingResultColum;
        val countColumn = Count(stringLiteral("*"))

        val processingResultCounts = SequenceEntriesView
            .select(processingResultColum, countColumn)
            .where { getGroupCondition(groupIdsFilter, authenticatedUser) }
            .andWhere { SequenceEntriesView.statusIs(Status.PROCESSED) }
            .apply {
                if (organism != null) {
                    andWhere { SequenceEntriesView.organismIs(organism) }
                }
            }
            .groupBy(processingResultColum)
            .associate { ProcessingResult.fromString(it[processingResultColum]) to it[countColumn].toInt() }

        return ProcessingResult.entries.associateWith { processingResultCounts[it] ?: 0 }
    }

    fun revoke(
        accessions: List<Accession>,
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        versionComment: String?,
    ): List<SubmissionIdMapping> {
        log.info { "revoking ${accessions.size} sequences" }

        accessionPreconditionValidator.validate {
            thatAccessionsExist(accessions)
                .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                .andThatSequenceEntriesAreInStates(listOf(Status.APPROVED_FOR_RELEASE))
                .andThatOrganismIs(organism)
        }

        SequenceEntriesTable.insert(
            SequenceEntriesTable.select(
                SequenceEntriesTable.accessionColumn, SequenceEntriesTable.versionColumn.plus(1),
                when (versionComment) {
                    null -> Op.nullOp()
                    else -> stringParam(versionComment)
                },
                SequenceEntriesTable.submissionIdColumn,
                SequenceEntriesTable.submitterColumn,
                SequenceEntriesTable.groupIdColumn,
                dateTimeParam(dateProvider.getCurrentDateTime()),
                booleanParam(true), SequenceEntriesTable.organismColumn,
            ).where {
                (
                    SequenceEntriesTable.accessionColumn inList
                        accessions
                    ) and
                    SequenceEntriesTable.isMaxVersion
            },
            columns = listOf(
                SequenceEntriesTable.accessionColumn,
                SequenceEntriesTable.versionColumn,
                SequenceEntriesTable.versionCommentColumn,
                SequenceEntriesTable.submissionIdColumn,
                SequenceEntriesTable.submitterColumn,
                SequenceEntriesTable.groupIdColumn,
                SequenceEntriesTable.submittedAtTimestampColumn,
                SequenceEntriesTable.isRevocationColumn,
                SequenceEntriesTable.organismColumn,
            ),
        )

        auditLogger.log(
            authenticatedUser.username,
            "Revoked ${accessions.size} sequences: " +
                accessions.joinToString(),
        )

        return SequenceEntriesView
            .select(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.isRevocationColumn,
                SequenceEntriesView.groupIdColumn,
                SequenceEntriesView.submissionIdColumn,
            )
            .where {
                (SequenceEntriesView.accessionColumn inList accessions) and
                    SequenceEntriesView.isMaxVersion and
                    SequenceEntriesView.statusIs(Status.PROCESSED) and
                    SequenceEntriesView.processingResultIsOneOf(
                        listOf(HAS_WARNINGS, NO_ISSUES),
                    )
            }
            .orderBy(SequenceEntriesView.accessionColumn)
            .map {
                SubmissionIdMapping(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                    it[SequenceEntriesView.submissionIdColumn],
                )
            }
    }

    fun deleteSequenceEntryVersions(
        accessionVersionsFilter: List<AccessionVersion>?,
        authenticatedUser: AuthenticatedUser,
        groupIdsFilter: List<Int>?,
        organism: Organism,
        scope: DeleteSequenceScope,
    ): List<AccessionVersion> {
        if (accessionVersionsFilter == null) {
            log.info {
                "deleting all sequences of all groups ${authenticatedUser.username} is member of in the scope $scope"
            }
        } else {
            log.info {
                "deleting ${accessionVersionsFilter.size} sequences by ${authenticatedUser.username} in scope $scope"
            }
        }

        val listOfDeletableStatuses = listOf(
            Status.RECEIVED,
            Status.PROCESSED,
        )

        if (accessionVersionsFilter != null) {
            accessionPreconditionValidator.validate {
                thatAccessionVersionsExist(accessionVersionsFilter)
                    .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                    .andThatSequenceEntriesAreInStates(listOfDeletableStatuses)
                    .andThatOrganismIs(organism)
            }
        }

        val accessionCondition = if (accessionVersionsFilter != null) {
            SequenceEntriesView.accessionVersionIsIn(accessionVersionsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            SequenceEntriesView.groupIsOneOf(groupManagementDatabaseService.getGroupIdsOfUser(authenticatedUser))
        }

        val scopeCondition = when (scope) {
            DeleteSequenceScope.PROCESSED_WITH_ERRORS -> SequenceEntriesView.statusIs(Status.PROCESSED) and
                SequenceEntriesView.processingResultIs(HAS_ERRORS)
            DeleteSequenceScope.PROCESSED_WITH_WARNINGS -> SequenceEntriesView.statusIs(Status.PROCESSED) and
                SequenceEntriesView.processingResultIs(HAS_WARNINGS)

            DeleteSequenceScope.ALL -> SequenceEntriesView.statusIsOneOf(listOfDeletableStatuses)
        }

        val groupCondition = getGroupCondition(groupIdsFilter, authenticatedUser)
        val organismCondition = SequenceEntriesView.organismIs(organism)

        val sequenceEntriesToDelete = SequenceEntriesView
            .select(SequenceEntriesView.accessionColumn, SequenceEntriesView.versionColumn)
            .where { accessionCondition and scopeCondition and groupCondition and organismCondition }
            .map {
                AccessionVersion(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                )
            }

        for (accessionVersionsChunk in sequenceEntriesToDelete.chunked(1000)) {
            SequenceEntriesTable.deleteWhere { accessionVersionIsIn(accessionVersionsChunk) }
        }

        auditLogger.log(
            authenticatedUser.username,
            "Delete ${sequenceEntriesToDelete.size} " +
                "unreleased sequences: " + sequenceEntriesToDelete.joinToString { it.displayAccessionVersion() },
        )

        return sequenceEntriesToDelete
    }

    fun submitEditedData(
        authenticatedUser: AuthenticatedUser,
        editedSequenceEntryData: EditedSequenceEntryData,
        organism: Organism,
    ) {
        log.info { "edited sequence entry submitted $editedSequenceEntryData" }

        accessionPreconditionValidator.validate {
            thatAccessionVersionExists(editedSequenceEntryData)
                .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                .andThatSequenceEntriesAreInStates(listOf(Status.PROCESSED))
                .andThatOrganismIs(organism)
        }

        SequenceEntriesTable.update(
            where = {
                SequenceEntriesTable.accessionVersionIsIn(listOf(editedSequenceEntryData))
            },
        ) {
            it[originalDataColumn] = compressionService
                .compressSequencesInOriginalData(editedSequenceEntryData.data, organism)
        }

        SequenceEntriesPreprocessedDataTable.deleteWhere {
            accessionVersionEquals(editedSequenceEntryData)
        }

        auditLogger.log(
            authenticatedUser.username,
            "Edited sequence: " +
                editedSequenceEntryData.displayAccessionVersion(),
        )
    }

    fun getSequenceEntryVersionToEdit(
        authenticatedUser: AuthenticatedUser,
        accessionVersion: AccessionVersion,
        organism: Organism,
    ): SequenceEntryVersionToEdit {
        log.info {
            "Getting sequence entry ${accessionVersion.displayAccessionVersion()} " +
                "by ${authenticatedUser.username} to edit"
        }

        accessionPreconditionValidator.validate {
            thatAccessionVersionExists(accessionVersion)
                .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                .andThatSequenceEntriesAreInStates(listOf(Status.PROCESSED))
                .andThatOrganismIs(organism)
        }

        val selectedSequenceEntry = SequenceEntriesView.select(
            SequenceEntriesView.accessionColumn,
            SequenceEntriesView.versionColumn,
            SequenceEntriesView.groupIdColumn,
            SequenceEntriesView.statusColumn,
            SequenceEntriesView.processedDataColumn,
            SequenceEntriesView.originalDataColumn,
            SequenceEntriesView.errorsColumn,
            SequenceEntriesView.warningsColumn,
            SequenceEntriesView.isRevocationColumn,
            SequenceEntriesView.submissionIdColumn,
        )
            .where { SequenceEntriesView.accessionVersionEquals(accessionVersion) }
            .first()

        if (selectedSequenceEntry[SequenceEntriesView.isRevocationColumn]) {
            throw UnprocessableEntityException(
                "Accession version ${accessionVersion.displayAccessionVersion()} is a revocation.",
            )
        }

        return SequenceEntryVersionToEdit(
            accession = selectedSequenceEntry[SequenceEntriesView.accessionColumn],
            version = selectedSequenceEntry[SequenceEntriesView.versionColumn],
            status = Status.fromString(selectedSequenceEntry[SequenceEntriesView.statusColumn]),
            groupId = selectedSequenceEntry[SequenceEntriesView.groupIdColumn],
            processedData = compressionService.decompressSequencesInProcessedData(
                selectedSequenceEntry[SequenceEntriesView.processedDataColumn]!!,
                organism,
            ),
            originalData = compressionService.decompressSequencesInOriginalData(
                selectedSequenceEntry[SequenceEntriesView.originalDataColumn]!!,
                organism,
            ),
            errors = selectedSequenceEntry[SequenceEntriesView.errorsColumn],
            warnings = selectedSequenceEntry[SequenceEntriesView.warningsColumn],
            submissionId = selectedSequenceEntry[SequenceEntriesView.submissionIdColumn],
        )
    }

    private fun originalMetadataFilter(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>?,
        statusesFilter: List<Status>?,
    ): Op<Boolean> {
        val organismCondition = SequenceEntriesView.organismIs(organism)
        val groupCondition = getGroupCondition(groupIdsFilter, authenticatedUser)
        val statusCondition = if (statusesFilter != null) {
            SequenceEntriesView.statusIsOneOf(statusesFilter)
        } else {
            Op.TRUE
        }
        val conditions = organismCondition and groupCondition and statusCondition

        return conditions
    }

    fun countOriginalMetadata(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>?,
        statusesFilter: List<Status>?,
    ): Long = SequenceEntriesView
        .selectAll()
        .where(
            originalMetadataFilter(
                authenticatedUser,
                organism,
                groupIdsFilter,
                statusesFilter,
            ),
        )
        .count()

    fun streamOriginalMetadata(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>?,
        statusesFilter: List<Status>?,
        fields: List<String>?,
    ): Sequence<AccessionVersionOriginalMetadata> {
        val originalMetadata = SequenceEntriesView.originalDataColumn
            .extract<Map<String, String>>("metadata")
            .alias("original_metadata")

        return SequenceEntriesView
            .select(
                originalMetadata,
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submitterColumn,
            )
            .where(
                originalMetadataFilter(
                    authenticatedUser,
                    organism,
                    groupIdsFilter,
                    statusesFilter,
                ),
            )
            .fetchSize(streamBatchSize)
            .asSequence()
            .map {
                val metadata = it[originalMetadata]
                val selectedMetadata = fields?.associateWith { field -> metadata[field] }
                    ?: metadata
                AccessionVersionOriginalMetadata(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                    it[SequenceEntriesView.submitterColumn],
                    selectedMetadata,
                )
            }
    }

    fun cleanUpStaleSequencesInProcessing(timeToStaleInSeconds: Long) {
        val staleDateTime = dateProvider.getCurrentInstant()
            .minus(timeToStaleInSeconds, DateTimeUnit.SECOND, DateProvider.timeZone)
            .toLocalDateTime(DateProvider.timeZone)

        // Check if there are any stale sequences before attempting to delete
        val staleSequencesExist = SequenceEntriesPreprocessedDataTable
            .selectAll()
            .where {
                SequenceEntriesPreprocessedDataTable.statusIs(IN_PROCESSING) and
                    (SequenceEntriesPreprocessedDataTable.startedProcessingAtColumn.less(staleDateTime))
            }
            .limit(1)
            .count() > 0

        if (staleSequencesExist) {
            val numberDeleted = SequenceEntriesPreprocessedDataTable.deleteWhere {
                statusIs(IN_PROCESSING) and startedProcessingAtColumn.less(staleDateTime)
            }
            log.info { "Cleaned up $numberDeleted stale sequences in processing" }
        } else {
            log.info { "No stale sequences found for cleanup" }
        }
    }

    fun useNewerProcessingPipelineIfPossible(): Long? {
        log.info("Checking for newer processing pipeline versions")
        return transaction {
            val newVersion = findNewPreprocessingPipelineVersion()
                ?: return@transaction null

            val pipelineNeedsUpdate = CurrentProcessingPipelineTable
                .selectAll().where { CurrentProcessingPipelineTable.versionColumn neq newVersion }
                .limit(1)
                .empty()
                .not()

            if (pipelineNeedsUpdate) {
                log.info { "Updating current processing pipeline to newer version: $newVersion" }
                CurrentProcessingPipelineTable.update(
                    where = {
                        CurrentProcessingPipelineTable.versionColumn neq newVersion
                    },
                ) {
                    it[versionColumn] = newVersion
                    it[startedUsingAtColumn] = dateProvider.getCurrentDateTime()
                }
            }
            newVersion
        }
    }
}

private fun Transaction.findNewPreprocessingPipelineVersion(): Long? {
    val sql = """
        select
            newest.version as version
        from
            (
                select max(pipeline_version) as version
                from
                    ( -- Newer pipeline versions...
                        select distinct pipeline_version
                        from sequence_entries_preprocessed_data
                        where pipeline_version > (select version from current_processing_pipeline)
                    ) as newer
                where
                    not exists( -- ...for which no sequence exists...
                        select
                        from
                            ( -- ...that was processed successfully with the current version...
                                select accession, version
                                from sequence_entries_preprocessed_data
                                where
                                    pipeline_version = (select version from current_processing_pipeline)
                                    and processing_status = 'FINISHED'
                            ) as successful
                        where
                            -- ...but not successfully with the newer version.
                            not exists(
                                select
                                from sequence_entries_preprocessed_data this
                                where
                                    this.pipeline_version = newer.pipeline_version
                                    and this.accession = successful.accession
                                    and this.version = successful.version
                                    and this.processing_status = 'FINISHED'
                            )
                    )
            ) as newest;
    """.trimIndent()

    return exec(sql, explicitStatementType = StatementType.SELECT) { resultSet ->
        if (!resultSet.next()) {
            return@exec null
        }

        val version = resultSet.getLong("version")
        when {
            resultSet.wasNull() -> null
            else -> version
        }
    }
}

data class RawProcessedData(
    override val accession: Accession,
    override val version: Version,
    val isRevocation: Boolean,
    val versionComment: String?,
    val submitter: String,
    val groupId: Int,
    val groupName: String,
    val submittedAtTimestamp: LocalDateTime,
    val releasedAtTimestamp: LocalDateTime,
    val submissionId: String,
    val processedData: ProcessedData<GeneticSequence>,
    val dataUseTerms: DataUseTerms,
) : AccessionVersionInterface
