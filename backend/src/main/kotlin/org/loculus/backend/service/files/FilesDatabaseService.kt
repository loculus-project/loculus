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

    fun getOrphanedFileIds(threshold: LocalDateTime): Set<FileId> = queryUnreferencedFiles(
        extraCondition = "AND f.upload_requested_at < ?",
        params = listOf<Pair<IColumnType<*>, Any?>>(KotlinLocalDateTimeColumnType() to threshold),
    )

    fun getMarkedOrphanedFileIds(): Set<FileId> = queryUnreferencedFiles(
        extraCondition = "AND f.marked_for_deletion_at IS NOT NULL",
        params = emptyList(),
    )

    private fun queryUnreferencedFiles(extraCondition: String, params: List<Pair<IColumnType<*>, Any?>>): Set<FileId> {
        val sql = """
            -- check for files not referenced by a submission. For this, check the submitted_data
            -- and processed_data jsonb objects (but not archive_of_submitted_data)
            WITH referenced AS (
              -- fetch ids for files uploaded by users and referenced in submissions
              SELECT (fil->>'fileId')::uuid AS file_id
              FROM sequence_entries,
                 LATERAL jsonb_each(COALESCE(NULLIF(submitted_data->'files', 'null'::jsonb),'{}'::jsonb)) AS cat(k,v),
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
            SELECT f.id FROM files f
              LEFT JOIN referenced r ON r.file_id = f.id
              WHERE r.file_id IS NULL
                  $extraCondition;
        """.trimIndent()
        return transaction {
            exec(
                sql,
                params,
                explicitStatementType = StatementType.SELECT,
            ) { rs ->
                buildSet<FileId> {
                    while (rs.next()) {
                        add(rs.getObject("id", UUID::class.java))
                    }
                }
            } ?: emptySet()
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
