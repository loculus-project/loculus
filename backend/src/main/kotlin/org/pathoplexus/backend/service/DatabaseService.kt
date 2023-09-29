package org.pathoplexus.backend.service

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.LongNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.databind.node.TextNode
import com.fasterxml.jackson.module.kotlin.readValue
import com.mchange.v2.c3p0.ComboPooledDataSource
import org.pathoplexus.backend.config.DatabaseProperties
import org.pathoplexus.backend.model.HeaderId
import org.postgresql.util.PGobject
import org.springframework.stereotype.Service
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.Timestamp

@Service
class DatabaseService(
    private val databaseProperties: DatabaseProperties,
    private val sequenceValidatorService: SequenceValidatorService,
    private val objectMapper: ObjectMapper,
) {
    private val pool: ComboPooledDataSource = ComboPooledDataSource().apply {
        driverClass = databaseProperties.driver
        jdbcUrl = databaseProperties.jdbcUrl
        user = databaseProperties.username
        password = databaseProperties.password
    }

    private fun getConnection(): Connection {
        return pool.connection
    }

    fun <R> useTransactionalConnection(block: (connection: Connection) -> R): R {
        getConnection().use { conn ->
            try {
                conn.autoCommit = false
                val result: R = block(conn)
                conn.commit()
                return result
            } catch (e: Throwable) {
                conn.rollback()
                throw e
            } finally {
                conn.autoCommit = true
            }
        }
    }

    fun insertSubmissions(submitter: String, submittedData: List<Pair<String, String>>): List<HeaderId> {
        val headerIds = mutableListOf<HeaderId>()
        val sql = """
            insert into sequences (submitter, submitted_at, started_processing_at, status, custom_id, original_data)
            values (?, now(), null, ?,?, ?::jsonb )
            returning sequence_id, version;
        """.trimIndent()
        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, submitter)
                statement.setString(2, Status.RECEIVED.name)
                for (data in submittedData) {
                    statement.setString(3, data.first)
                    statement.setString(4, data.second)
                    statement.executeQuery().use { resultSet ->
                        resultSet.next()
                        headerIds.add(
                            HeaderId(resultSet.getLong("sequence_id"), resultSet.getInt("version"), data.first),
                        )
                    }
                }
            }
        }
        return headerIds
    }

    fun streamUnprocessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val sql = """
        update sequences set status = ?, started_processing_at = now()
        where sequence_id in (
            select sequence_id from sequences 
            where status = ? limit ?            
        )
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        returning sequence_id, version, original_data
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.PROCESSING.name)
                statement.setString(2, Status.RECEIVED.name)
                statement.setInt(3, numberOfSequences)
                val resultSet = statement.executeQuery()
                resultSet.use {
                    while (resultSet.next()) {
                        val sequence = Sequence(
                            resultSet.getLong("sequence_id"),
                            resultSet.getInt("version"),
                            objectMapper.readTree(resultSet.getString("original_data")),
                        )
                        val json = objectMapper.writeValueAsString(sequence)
                        outputStream.write(json.toByteArray())
                        outputStream.write('\n'.code)
                        outputStream.flush()
                    }
                }
            }
        }
    }

    fun updateProcessedData(inputStream: InputStream): List<ValidationResult> {
        val reader = BufferedReader(InputStreamReader(inputStream))

        val validationResults = mutableListOf<ValidationResult>()

        val checkIdSql = """
        select sequence_id
        from sequences 
        where sequence_id = ?
        """.trimIndent()

        val checkStatusSql = """
        select sequence_id
        from sequences 
        where sequence_id = ?
        and status = ?
        """.trimIndent()

        val updateSql = """
        update sequences
        set status = ?, finished_processing_at = now(), processed_data = ?, errors = ?, warnings = ?
        where sequence_id = ? 
        and version = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(updateSql).use { updateStatement ->
                conn.prepareStatement(checkStatusSql).use { checkIfStatusExistsStatement ->
                    conn.prepareStatement(checkIdSql).use { checkIfIdExistsStatement ->
                        reader.lineSequence().forEach { line ->
                            val sequence = objectMapper.readValue<Sequence>(line)

                            if (!idExists(sequence, checkIfIdExistsStatement, validationResults)) return@forEach

                            if (!statusExists(sequence, checkIfStatusExistsStatement, validationResults)) return@forEach

                            val validationResult = sequenceValidatorService.validateSequence(sequence)
                            if (sequenceValidatorService.isValidResult(validationResult)) {
                                executeUpdateProcessedData(sequence, updateStatement)
                            } else {
                                validationResults.add(validationResult)
                            }
                        }
                        reader.close()
                    }
                }
            }
        }

        return validationResults
    }

    private fun statusExists(
        sequence: Sequence,
        checkIfStatusExistsStatement: PreparedStatement,
        validationResults: MutableList<ValidationResult>,
    ): Boolean {
        checkIfStatusExistsStatement.setLong(1, sequence.sequenceId)
        checkIfStatusExistsStatement.setString(2, Status.PROCESSING.name)
        val statusIsProcessing = checkIfStatusExistsStatement.executeQuery().next()
        if (!statusIsProcessing) {
            validationResults.add(
                ValidationResult(
                    sequence.sequenceId,
                    emptyList(),
                    emptyList(),
                    emptyList(),
                    listOf("SequenceId does exist, but is not in processing state"),
                ),
            )
        }
        return statusIsProcessing
    }

    private fun idExists(
        sequence: Sequence,
        checkIfIdExistsStatement: PreparedStatement,
        validationResults: MutableList<ValidationResult>,
    ): Boolean {
        checkIfIdExistsStatement.setLong(1, sequence.sequenceId)
        val sequenceIdExists = checkIfIdExistsStatement.executeQuery().next()
        if (!sequenceIdExists) {
            validationResults.add(
                ValidationResult(
                    sequence.sequenceId,
                    emptyList(),
                    emptyList(),
                    emptyList(),
                    listOf("SequenceId does not exist"),
                ),
            )
        }
        return sequenceIdExists
    }

    private fun executeUpdateProcessedData(sequence: Sequence, updateStatement: PreparedStatement) {
        val hasErrors = sequence.errors != null &&
            sequence.errors.isArray &&
            sequence.errors.size() > 0

        if (hasErrors) {
            updateStatement.setString(1, Status.NEEDS_REVIEW.name)
        } else {
            updateStatement.setString(1, Status.PROCESSED.name)
        }

        updateStatement.setObject(
            2,
            PGobject().apply {
                type = "jsonb"; value = sequence.data.toString()
            },
        )
        updateStatement.setObject(
            3,
            PGobject().apply {
                type = "jsonb"; value = sequence.errors.toString()
            },
        )
        updateStatement.setObject(
            4,
            PGobject().apply {
                type = "jsonb"; value = sequence.warnings.toString()
            },
        )

        updateStatement.setLong(5, sequence.sequenceId)
        updateStatement.setInt(6, sequence.version)
        updateStatement.executeUpdate()
    }

    fun approveProcessedData(submitter: String, sequenceIds: List<Long>) {
        val sql = """
        update sequences
        set status = ?
        where sequence_id = any (?) 
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        and submitter = ? 
        and status = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.SILO_READY.name)
                statement.setArray(2, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.setString(3, submitter)
                statement.setString(4, Status.PROCESSED.name)
                statement.executeUpdate()
            }
        }
    }

    fun streamProcessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val sql = """
        select sequence_id, processed_data, warnings from sequences
        where sequence_id in (
            select sequence_id from sequences 
            where status = ? limit ?        
        )
        and version = (
                select max(version)
                from sequences s
                where s.sequence_id = sequences.sequence_id
            )
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.PROCESSED.name)
                statement.setInt(2, numberOfSequences)
                val rs = statement.executeQuery()
                rs.use {
                    while (rs.next()) {
                        val processedDataObject = objectMapper.readTree(rs.getString("processed_data")) as ObjectNode

                        val metadataJsonObject = processedDataObject["metadata"] as ObjectNode
                        metadataJsonObject.set<JsonNode>("sequenceId", LongNode(rs.getLong("sequence_id")))
                        metadataJsonObject.set<JsonNode>(
                            "warnings",
                            TextNode(rs.getString("warnings")),
                        )

                        processedDataObject.set<JsonNode>("metadata", metadataJsonObject)

                        outputStream.write(objectMapper.writeValueAsString(processedDataObject).toByteArray())
                        outputStream.write('\n'.code)
                        outputStream.flush()
                    }
                }
            }
        }
    }

    fun streamNeededReviewSubmissions(submitter: String, numberOfSequences: Int, outputStream: OutputStream) {
        val sql = """
        select sequence_id, version, processed_data, errors, warnings from sequences
        where sequence_id in (
            select sequence_id from sequences where status = ? and submitter = ? limit ?
        )
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.NEEDS_REVIEW.name)
                statement.setString(2, submitter)
                statement.setInt(3, numberOfSequences)
                val rs = statement.executeQuery()
                rs.use {
                    while (rs.next()) {
                        val sequence = Sequence(
                            rs.getLong("sequence_id"),
                            rs.getInt("version"),
                            objectMapper.readTree(rs.getString("processed_data")),
                            objectMapper.readTree(rs.getString("errors")),
                            objectMapper.readTree(rs.getString("warnings")),
                        )
                        val json = objectMapper.writeValueAsString(sequence)
                        outputStream.write(json.toByteArray())
                        outputStream.write('\n'.code)
                        outputStream.flush()
                    }
                }
            }
        }
    }

    fun getSequencesSubmittedBy(username: String): List<SequenceStatus> {
        val sequenceStatusList = mutableListOf<SequenceStatus>()
        val sql = """
            select sequence_id, status, version, revoked 
            from sequences 
            where submitter = ?
            and status != ?
            and version = (
                select max(version)
                from sequences s
                where s.sequence_id = sequences.sequence_id
            )
            
            union
            
            select sequence_id, status, max(version) as version, revoked
            from sequences
            where submitter = ?
            and status = ?
            
            group by sequence_id, status, revoked
            
            having max(version) = (
                select max(version)
                from sequences s
                where s.sequence_id = sequences.sequence_id
                and s.status = ?
            )
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, username)
                statement.setString(2, Status.SILO_READY.name)
                statement.setString(3, username)
                statement.setString(4, Status.SILO_READY.name)
                statement.setString(5, Status.SILO_READY.name)
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        val sequenceId = rs.getLong("sequence_id")
                        val version = rs.getInt("version")
                        val status = Status.fromString(rs.getString("status"))
                        val revoked = rs.getBoolean("revoked")
                        sequenceStatusList.add(SequenceStatus(sequenceId, version, status, revoked))
                    }
                }
            }
        }
        return sequenceStatusList
    }

    fun deleteUserSequences(username: String) {
        val sql = """
        delete from sequences
        where submitter = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, username)
                statement.executeUpdate()
            }
        }
    }

    fun deleteSequences(sequenceIds: List<Long>) {
        val sql = """
        delete from sequences
        where sequence_id = any (?)
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setArray(1, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.executeUpdate()
            }
        }
    }

    fun reviseData(sequenceId: Long) {
        val sql = """
        insert into sequences (sequence_id, version, custom_id, submitter, submitted_at, status, revoked, original_data)
        select ?, version + 1, custom_id, submitter, now(), ?, ?,  original_data
        from sequences
        where sequence_id = ?
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        and status = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setLong(1, sequenceId)
                statement.setString(2, Status.RECEIVED.name)
                statement.setBoolean(3, false)
                statement.setLong(4, sequenceId)
                statement.setString(5, Status.SILO_READY.name)
                statement.executeUpdate()
            }
        }
    }

    fun revokeData(sequenceIds: List<Long>): List<SequenceStatus> {
        val sql = """
        insert into sequences (sequence_id, version, custom_id, submitter, submitted_at, status, revoked)
        select sequence_id, version + 1, custom_id, submitter, now(), ?, true
        from sequences
        where sequence_id = any (?)
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        and status = ?
        returning sequence_id, version
        """.trimIndent()

        val revokedList = mutableListOf<SequenceStatus>()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.REVOKED_STAGING.name)
                statement.setArray(2, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.setString(3, Status.SILO_READY.name)
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        revokedList.add(
                            SequenceStatus(rs.getLong("sequence_id"), rs.getInt("version"), Status.REVOKED_STAGING),
                        )
                    }
                }
            }
        }
        return revokedList
    }

    fun confirmRevocation(sequenceIds: List<Long>): List<SequenceStatus> {
        val sql = """
        update sequences set status = ?
        where status = ? 
        and sequence_id = any (?)   
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        returning sequence_id, version, status
        """.trimIndent()

        val confirmationList = mutableListOf<SequenceStatus>()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.SILO_READY.name)
                statement.setString(2, Status.REVOKED_STAGING.name)
                statement.setArray(3, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        confirmationList.add(
                            SequenceStatus(
                                rs.getLong("sequence_id"),
                                rs.getInt("version"),
                                Status.fromString(rs.getString("status")),
                            ),
                        )
                    }
                }
            }
        }

        return confirmationList
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

data class Sequence(
    val sequenceId: Long,
    val version: Int,
    val data: JsonNode,
    val errors: JsonNode? = null,
    val warnings: JsonNode? = null,
)

data class SequenceStatus(
    val sequenceId: Long,
    val version: Int,
    val status: Status,
    val revoked: Boolean = false,
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
