package org.loculus.backend.service.files

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.IColumnType
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNotNull
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.KotlinLocalDateTimeColumnType
import org.jetbrains.exposed.sql.not
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.chunkedForDatabase
import org.loculus.backend.utils.processInDatabaseSafeChunks
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.*

@Service
@Transactional
class FilesDatabaseService(private val dateProvider: DateProvider) {

    fun createFileEntry(fileId: UUID, uploader: String, groupId: Int, multipartUploadId: String? = null) {
        val now = dateProvider.getCurrentDateTime()
        FilesTable.insert {
            it[idColumn] = fileId
            it[uploadRequestedAtColumn] = now
            it[uploaderColumn] = uploader
            it[groupIdColumn] = groupId
            it[FilesTable.multipartUploadId] = multipartUploadId
        }
    }

    fun deleteFileEntry(fileId: UUID) {
        FilesTable.deleteWhere { FilesTable.idColumn eq fileId }
    }

    fun getGroupIds(fileIds: Set<FileId>): Map<FileId, Int> = fileIds.chunkedForDatabase({ chunk ->
        FilesTable.select(FilesTable.idColumn, FilesTable.groupIdColumn)
            .where { FilesTable.idColumn inList chunk }
            .map { Pair(it[FilesTable.idColumn], it[FilesTable.groupIdColumn]) }
    }, 1).toMap()

    /**
     * Return a mapping of file IDs and multipart upload IDs for the files for which multipart upload has been
     * initiated but not completed
     */
    fun getUncompletedMultipartUploadIds(fileIds: Set<FileId>): List<Pair<FileId, MultipartUploadId>> =
        fileIds.chunkedForDatabase({ chunk ->
            FilesTable
                .select(FilesTable.idColumn, FilesTable.multipartUploadId)
                .where {
                    FilesTable.idColumn inList chunk and
                        (FilesTable.multipartUploadId neq null) and
                        (not(FilesTable.multipartCompleted))
                }
                .map { it[FilesTable.idColumn] to it[FilesTable.multipartUploadId]!! }
        }, 1)

    fun getNonExistentFileIds(fileIds: Set<FileId>): Set<FileId> = fileIds.chunkedForDatabase({ chunk ->
        val existingIds = FilesTable
            .select(FilesTable.idColumn)
            .where { FilesTable.idColumn inList chunk }
            .map { it[FilesTable.idColumn] }
            .toSet()
        chunk.filterNot { it in existingIds }
    }, 1).toSet()

    fun getOrphanedFileIds(threshold: LocalDateTime): Map<FileId, LocalDateTime?> {
        val sql = """
            -- check for files not referenced by a submission. For this, check the submitted_data,
            -- archive_of_submitted_data and processed_data jsonb objects
            WITH referenced AS (
                -- fetch ids for files uploaded by users and referenced in submissions
                SELECT (fil->>'fileId')::uuid AS file_id
                FROM sequence_entries se,
                    LATERAL (
                        VALUES
                        (se.submitted_data),
                        (se.archive_of_submitted_data)
                    ) AS src(data),
                    LATERAL jsonb_each(
                        COALESCE(NULLIF(src.data->'files', 'null'::jsonb), '{}'::jsonb)
                    ) AS cat(k, v),
                    LATERAL jsonb_array_elements(cat.v) AS fil
                UNION
                -- also need to check processed_data since preprocessing
                -- can create files that are never referenced in submissions
                SELECT (fil->>'fileId')::uuid AS file_id
                FROM sequence_entries_preprocessed_data sepd
                JOIN sequence_entries se
                    ON se.accession = sepd.accession
                    AND se.version   = sepd.version,
                    LATERAL jsonb_each(COALESCE(NULLIF(sepd.processed_data->'files', 'null'::jsonb),'{}'::jsonb)) AS cat(k,v),
                    LATERAL jsonb_array_elements(cat.v) AS fil
            )
            SELECT f.id, f.marked_for_deletion_at FROM files f
              LEFT JOIN referenced r ON r.file_id = f.id
              WHERE r.file_id IS NULL
                    AND f.upload_requested_at < ?;
        """.trimIndent()
        return transaction {
            exec(
                sql,
                listOf<Pair<IColumnType<*>, Any?>>(Pair(KotlinLocalDateTimeColumnType(), threshold)),
                explicitStatementType = StatementType.SELECT,
            ) { rs ->
                buildMap<FileId, LocalDateTime?> {
                    while (rs.next()) {
                        val id = rs.getObject("id", UUID::class.java)
                        val markedAt = rs.getTimestamp("marked_for_deletion_at")?.toLocalDateTime()?.let { ldt ->
                            LocalDateTime(
                                ldt.year,
                                ldt.monthValue,
                                ldt.dayOfMonth,
                                ldt.hour,
                                ldt.minute,
                                ldt.second,
                                ldt.nano,
                            )
                        }
                        put(id, markedAt)
                    }
                }
            } ?: emptyMap()
        }
    }

    fun markFilesForDeletion(fileIds: Set<FileId>) {
        if (fileIds.isEmpty()) return
        val now = dateProvider.getCurrentDateTime()
        fileIds.processInDatabaseSafeChunks { chunk ->
            FilesTable.update({ FilesTable.idColumn inList chunk }) {
                it[markedForDeletionAtColumn] = now
            }
        }
    }

    fun getMarkedForDeletionFileIds(fileIds: Set<FileId>): Set<FileId> = fileIds.chunkedForDatabase({ chunk ->
        FilesTable
            .select(FilesTable.idColumn)
            .where { FilesTable.idColumn inList chunk and FilesTable.markedForDeletionAtColumn.isNotNull() }
            .map { it[FilesTable.idColumn] }
    }, 1).toSet()

    /**
     * Return the subset of file IDs for which the file size hasn't been checked yet or
     * no file has been uploaded yet (and therefore there's no file size).
     */
    fun getUncheckedFileIds(fileIds: Set<FileId>): Set<FileId> = fileIds.chunkedForDatabase({ chunk ->
        FilesTable
            .select(FilesTable.idColumn)
            .where { FilesTable.idColumn inList chunk and (FilesTable.sizeColumn eq null) }
            .map { it[FilesTable.idColumn] }
    }, 1).toSet()

    fun setFileSize(fileId: FileId, size: Long) {
        FilesTable.update({
            FilesTable.idColumn eq fileId
        }) {
            it[sizeColumn] = size
        }
    }

    fun completeMultipartUpload(fileId: FileId) {
        FilesTable.update({
            FilesTable.idColumn eq fileId
        }) {
            it[multipartCompleted] = true
        }
    }
}
