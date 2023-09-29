package org.pathoplexus.backend.service

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
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
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.stringParam
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.wrapAsExpression
import org.pathoplexus.backend.model.HeaderId
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.sql.Timestamp
import javax.sql.DataSource

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

    fun insertSubmissions(submitter: String, submittedData: List<Pair<String, String>>): List<HeaderId> {
        log.info { "submitting ${submittedData.size} new sequences by $submitter" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return submittedData.map { data ->
            val insert = SequencesTable.insert {
                it[SequencesTable.submitter] = submitter
                it[submittedAt] = now
                it[version] = 1
                it[status] = Status.RECEIVED.name
                it[customId] = data.first
                it[originalData] = objectMapper.readTree(data.second)
            }
            HeaderId(insert[SequencesTable.sequenceId], 1, data.first)
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
                SequenceVersion(
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

    private fun updateStatusToProcessing(sequences: List<SequenceVersion>) {
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

    private fun stream(
        sequencesData: List<SequenceVersion>,
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
            throw IllegalArgumentException("User does not have right to change these sequences")
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
            ).count()
        return sequencesOwnedByUser == sequenceIds.size.toLong()
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
                    QueryParameter(it.data, SequencesTable.originalData.columnType),
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

    // CitationController
    fun postCreateAuthor(affiliation: String, email: String, name: String): Long {
        var createAuthorId: Long = -1
        val sql = """
            insert into authors (affiliation, email, name, created_at, created_by, updated_at, updated_by)
            values (?, ?, ?, now(), ?, now(), ?)
            returning author_id;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, affiliation)
                statement.setString(2, email)
                statement.setString(3, name)
                statement.setString(4, "nobody")
                statement.setString(5, "nobody")

                statement.executeQuery().use { resultSet ->
                    resultSet.next()
                    createAuthorId = resultSet.getLong("author_id")
                }
            }
        }
        return createAuthorId
    }
    fun getReadAuthor(authorId: Long): List<Author> {
        var authorList = mutableListOf<Author>()
        val sql = """
            select *
            from authors 
            where author_id = ?;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setLong(1, authorId)
                statement.executeQuery().use { rs ->
                    if(rs.next()) {
                        authorList.add(Author(
                            rs.getLong("author_id"),
                            rs.getString("affiliation"),
                            rs.getString("email"),
                            rs.getString("name"),
                            rs.getTimestamp("created_at"),
                            rs.getString("created_by"),
                            rs.getTimestamp("updated_at"),
                            rs.getString("updated_by")
                        ))
                    }
                }
            }
        }
        return authorList
    }
    fun patchUpdateAuthor(authorId: Long, affiliation: String, email: String, name: String) {
        val sql = """
            update authors set affiliation = ?, email = ?, name = ?, updated_at = now(), updated_by = ?
            where author_id = ?;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, affiliation)
                statement.setString(2, email)
                statement.setString(3, name)
                statement.setString(4, "nobody")
                statement.setLong(5, authorId)
                statement.executeUpdate()
            }
        }
    }
    fun deleteAuthor(authorId: Long) {
        val sql = """
            delete from authors
            where author_id = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setLong(1, authorId)
                statement.executeUpdate()
            }
        }
    }
    fun getAuthorCount(): Number {
        var authorCount = 0
        val sql = """
            select count(author_id)
            from authors;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.executeQuery().use { rs ->
                    rs.next()
                    authorCount = rs.getInt("count")
                }
            }
        }
        return authorCount
    }

    fun postCreateBibliography(data: String, name: String, type: String): Long {
        var createBibliographyId: Long = -1
        val sql = """
            insert into bibliographies (data, name, type, created_at, created_by, updated_at, updated_by)
            values (?, ?, ?, now(), ?, now(), ?)
            returning bibliography_id;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, data)
                statement.setString(2, name)
                statement.setString(3, type)
                statement.setString(4, "nobody")
                statement.setString(5, "nobody")

                statement.executeQuery().use { resultSet ->
                    resultSet.next()
                    createBibliographyId = resultSet.getLong("bibliography_id")
                }
            }
        }
        return createBibliographyId
    }
    fun getReadBibliography(bibliographyId: Long): List<Bibliography> {
        var bibliographyList = mutableListOf<Bibliography>()
        val sql = """
            select *
            from bibliographies 
            where bibliography_id = ?;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setLong(1, bibliographyId)
                statement.executeQuery().use { rs ->
                    if(rs.next()) {
                        bibliographyList.add(Bibliography(
                            rs.getLong("bibliography_id"),
                            rs.getString("data"),
                            rs.getString("name"),
                            rs.getString("type"),
                            rs.getTimestamp("created_at"),
                            rs.getString("created_by"),
                            rs.getTimestamp("updated_at"),
                            rs.getString("updated_by")
                        ))
                    }
                }
            }
        }
        return bibliographyList
    }
    fun patchUpdateBibliography(bibliographyId: Long, data: String, name: String, type: String) {
        val sql = """
            update bibliographies set data = ?, name = ?, type = ?, updated_at = now(), updated_by = ?
            where bibliography_id = ?;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, data)
                statement.setString(2, name)
                statement.setString(3, type)
                statement.setString(4, "nobody")
                statement.setLong(5, bibliographyId)
                statement.executeUpdate()
            }
        }
    }
    fun deleteBibliography(bibliographyId: Long) {
        val sql = """
            delete from bibliographies
            where bibliography_id = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setLong(1, bibliographyId)
                statement.executeUpdate()
            }
        }
    }
    fun getBibliographyCount(): Number {
        var bibliographyCount = 0
        val sql = """
            select count(bilbiography_id)
            from bibliographies;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.executeQuery().use { rs ->
                    rs.next()
                    bibliographyCount = rs.getInt("count")
                }
            }
        }
        return bibliographyCount
    }

    fun postCreateCitation(data: String, type: String): Long {
        var createCitationId: Long = -1
        val sql = """
            insert into citations (data, type, created_at, created_by, updated_at, updated_by)
            values (?, ?, now(), ?, now(), ?)
            returning citation_id;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, data)
                statement.setString(2, type)
                statement.setString(3, "nobody")
                statement.setString(4, "nobody")

                statement.executeQuery().use { resultSet ->
                    resultSet.next()
                    createCitationId = resultSet.getLong("citation_id")
                }
            }
        }
        return createCitationId
    }
    fun getReadCitation(citationId: Long): List<Citation> {
        var citationList = mutableListOf<Citation>()
        val sql = """
            select *
            from citations 
            where citation_id = ?;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setLong(1, citationId)
                statement.executeQuery().use { rs ->
                    if(rs.next()) {
                        citationList.add(Citation(
                            rs.getLong("citation_id"),
                            rs.getString("data"),
                            rs.getString("type"),
                            rs.getTimestamp("created_at"),
                            rs.getString("created_by"),
                            rs.getTimestamp("updated_at"),
                            rs.getString("updated_by")
                        ))
                    }
                }
            }
        }
        return citationList
    }
    fun patchUpdateCitation(citationId: Long, data: String, type: String) {
        val sql = """
            update citations set data = ?, type = ?, updated_at = now(), updated_by = ?
            where citation_id = ?;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, data)
                statement.setString(2, type)
                statement.setString(3, "nobody")
                statement.setLong(4, citationId)
                statement.executeUpdate()
            }
        }
    }
    fun deleteCitation(citationId: Long) {
        val sql = """
            delete from citations
            where citation_id = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setLong(1, citationId)
                statement.executeUpdate()
            }
        }
    }
    fun getCitationCount(): Number {
        var citationCount = 0
        val sql = """
            select count(citation_id)
            from citations;
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.executeQuery().use { rs ->
                    rs.next()
                    citationCount = rs.getInt("count")
                }
            }
        }
        return citationCount
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
    val data: JsonNode,
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
data class Author(
    val authorId: Long,
    val affiliation: String,
    val email: String,
    val name: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val updatedAt: Timestamp,
    val updatedBy: String,
    val metadata: JsonNode? = null
)

data class Bibliography(
    val bibliographyId: Long,
    val data: String,
    val name: String,
    val type: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val updatedAt: Timestamp,
    val updatedBy: String,
    val metadata: JsonNode? = null
)

data class Citation(
    val citationId: Long,
    val data: String,
    val type: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val updatedAt: Timestamp,
    val updatedBy: String,
    val metadata: JsonNode? = null
)
