package org.loculus.backend.service.submission

import kotlinx.datetime.LocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.max
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdFilesMap
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.model.SegmentName
import org.loculus.backend.model.SubmissionId
import org.loculus.backend.model.SubmissionParams
import org.loculus.backend.service.GenerateAccessionFromNumberService
import org.loculus.backend.service.datauseterms.DataUseTermsDatabaseService
import org.loculus.backend.service.submission.SequenceEntriesTable.versionColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.versionCommentColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.accessionColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.organismColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.submissionIdColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.submitterColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.approverColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.groupIdColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.submittedAtTimestampColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.releasedAtTimestampColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.originalDataColumn
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DatabaseConstants
import org.loculus.backend.utils.DatabaseConstants.POSTGRESQL_PARAMETER_LIMIT
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.MetadataEntry
import org.loculus.backend.utils.ParseFastaHeader
import org.loculus.backend.utils.Version
import org.loculus.backend.utils.chunkedForDatabase
import org.loculus.backend.utils.getNextSequenceNumbers
import org.loculus.backend.utils.processInDatabaseSafeChunks
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

private val log = KotlinLogging.logger { }

private const val SEQUENCE_INSERT_COLUMNS = 4
private const val METADATA_INSERT_COLUMNS = 8
private const val SEQUENCE_ENTRIES_INSERT_COLUMNS = 10
private const val SEQUENCE_BATCH_SIZE = DatabaseConstants.POSTGRESQL_PARAMETER_LIMIT / SEQUENCE_INSERT_COLUMNS
private const val METADATA_BATCH_SIZE = DatabaseConstants.POSTGRESQL_PARAMETER_LIMIT / METADATA_INSERT_COLUMNS
private const val SEQUENCE_ENTRIES_BATCH_SIZE =
    DatabaseConstants.POSTGRESQL_PARAMETER_LIMIT / SEQUENCE_ENTRIES_INSERT_COLUMNS

@Service
@Transactional
class UploadDatabaseService(
    private val parseFastaHeader: ParseFastaHeader,
    private val compressor: CompressionService,
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val dataUseTermsDatabaseService: DataUseTermsDatabaseService,
    private val generateAccessionFromNumberService: GenerateAccessionFromNumberService,
    private val auditLogger: AuditLogger,
    private val dateProvider: DateProvider,
) {
    data class SequenceEntry(
        val accession: Accession,
        val version: Long,
        val versionComment: String?,
        val organism: Organism,
        val submissionId: SubmissionId,
        val submitter: String,
        val approver: String?,
        val groupId: Int,
        val submittedAtTimestamp: LocalDateTime,
        val releasedAtTimestamp: LocalDateTime?,
        val originalData: OriginalData<CompressedSequence>,
    )

    fun createNewSequenceEntries(
        metadata: Map<String, MetadataEntry>,
        sequences: Map<String, Map<SegmentName, String>>,
        files: SubmissionIdFilesMap?,
        submissionParams: SubmissionParams.OriginalSubmissionParams,
    ): List<SubmissionIdMapping> {

        log.debug { "Creating new sequence entries" }

        val now = dateProvider.getCurrentDateTime()

        val newAccessions = generateNewAccessions(metadata.keys)

        val newEntries = newAccessions.map { (submissionId, accession) ->
            SequenceEntry(
                accession = accession,
                version = 1,
                versionComment = null,
                organism = submissionParams.organism,
                submissionId = submissionId,
                submitter = submissionParams.authenticatedUser.username,
                approver = null,
                groupId = submissionParams.groupId,
                submittedAtTimestamp = now,
                releasedAtTimestamp = null,
                originalData = OriginalData(
                    metadata = metadata[submissionId]?.metadata ?: emptyMap(),
                    files = files?.get(submissionId),
                    unalignedNucleotideSequences = sequences[submissionId]?.mapValues { (segmentName, sequence) ->
                        compressor.compressNucleotideSequence(
                            sequence,
                            segmentName,
                            submissionParams.organism,
                        )
                    } ?: emptyMap(),
                ),
            )
        }

        val submissionIdMapping = insertEntries(newEntries)

        dataUseTermsDatabaseService.setNewDataUseTerms(
            submissionParams.authenticatedUser,
            newAccessions.map { it.second },
            submissionParams.dataUseTerms,
        )

        return submissionIdMapping

    }

    fun createRevisionEntries(
        metadata: Map<String, MetadataEntry>,
        sequences: Map<String, Map<SegmentName, String>>,
        files: SubmissionIdFilesMap?,
        submissionParams: SubmissionParams.RevisionSubmissionParams,
    ): List<SubmissionIdMapping> {

        log.debug { "Creating revision entries" }

        val submissionIdToAccession = metadata.map { (submissionId, entry) ->
            val accession = entry.metadata["accession"]
                ?: throw IllegalStateException("Metadata for submissionId $submissionId does not contain an accession")
            Pair(submissionId, accession)
        }.toMap()

        submissionIdToAccession.values.processInDatabaseSafeChunks { chunk ->
            accessionPreconditionValidator.validate {
                thatAccessionsExist(chunk)
                    .andThatUserIsAllowedToEditSequenceEntries(submissionParams.authenticatedUser)
                    .andThatSequenceEntriesAreInStates(listOf(Status.APPROVED_FOR_RELEASE))
                    .andThatOrganismIs(submissionParams.organism)
            }
        }

        data class SequenceInfo(
            val latestVersion: Version,
            val groupId: Int,
        )

        val sequenceInfo =
            submissionIdToAccession.values.chunked(POSTGRESQL_PARAMETER_LIMIT / 2) { chunk ->
                SequenceEntriesTable.select(
                    accessionColumn,
                    versionColumn.max(),
                    groupIdColumn,
                )
                    .where { accessionColumn inList chunk }
                    .groupBy(accessionColumn)
                    .associate {
                        it[accessionColumn] to
                                SequenceInfo(
                                    latestVersion = it[versionColumn],
                                    groupId = it[groupIdColumn],
                                )
                    }
            }.flatMap(Map<Accession, SequenceInfo>::toList).toMap()

        val now = dateProvider.getCurrentDateTime()

        val newEntries = metadata.values.map { entry ->
            val accession = submissionIdToAccession[entry.submissionId] ?: throw IllegalStateException(
                "Metadata for submissionId ${entry.submissionId} does not contain an accession",
            )
            val info = sequenceInfo[accession]
                ?: throw IllegalStateException("Could not find latest version for accession $accession")
            val newVersion = info.latestVersion + 1
            SequenceEntry(
                accession = accession,
                version = newVersion,
                versionComment = entry.metadata["versionComment"],
                organism = submissionParams.organism,
                submissionId = entry.submissionId,
                submitter = submissionParams.authenticatedUser.username,
                approver = null,
                groupId = info.groupId,
                submittedAtTimestamp = now,
                releasedAtTimestamp = null,
                originalData = OriginalData(
                    metadata = entry.metadata,
                    files = files?.get(entry.submissionId),
                    unalignedNucleotideSequences = sequences[entry.submissionId]?.mapValues { (segmentName, sequence) ->
                        compressor.compressNucleotideSequence(
                            sequence,
                            segmentName,
                            submissionParams.organism,
                        )
                    } ?: emptyMap(),
                ),
            )
        }

        return insertEntries(newEntries)
    }

    private fun insertEntries(newEntries: List<SequenceEntry>): List<SubmissionIdMapping> {
        newEntries.chunkedForDatabase(
            { batch ->
                SequenceEntriesTable.batchInsert(batch) {
                    this[accessionColumn] = it.accession
                    this[versionColumn] = it.version
                    this[versionCommentColumn] = it.versionComment
                    this[organismColumn] = it.organism.name
                    this[submissionIdColumn] = it.submissionId
                    this[submitterColumn] = it.submitter
                    this[approverColumn] = it.approver
                    this[groupIdColumn] = it.groupId
                    this[submittedAtTimestampColumn] = it.submittedAtTimestamp
                    this[releasedAtTimestampColumn] = it.releasedAtTimestamp
                    this[originalDataColumn] = it.originalData
                }
                emptyList<Unit>()
            },
            SEQUENCE_ENTRIES_INSERT_COLUMNS,
        )

        return newEntries.map { entry ->
            SubmissionIdMapping(
                accession = entry.accession,
                version = entry.version,
                submissionId = entry.submissionId,
            )
        }
    }

    // Returns a list of pairs (submissionId, accession)
    fun generateNewAccessions(submissionIds: Collection<String>): List<Pair<String, Accession>> {
        log.info { "Generating ${submissionIds.size} new accessions" }
        val nextAccessions = getNextSequenceNumbers("accession_sequence", submissionIds.size).map {
            generateAccessionFromNumberService.generateCustomId(it)
        }

        if (submissionIds.size != nextAccessions.size) {
            throw IllegalStateException(
                "Mismatched sizes: accessions=${submissionIds.size}, nextAccessions=${nextAccessions.size}",
            )
        }

        log.info { "Generated ${submissionIds.size} new accessions" }
        return submissionIds.zip(nextAccessions)
    }
}
