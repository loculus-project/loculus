package org.loculus.backend.service.files

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.KotlinLocalDateTimeColumnType
import org.jetbrains.exposed.sql.not
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.utils.DatabaseConstants
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.chunkedForDatabase
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

    fun getOrphanedFileIds(threshold: LocalDateTime): Set<FileId> {
        val sql = """           
            -- check for files for which an upload was requested > threshold days ago
            -- but are not referenced by a submission. For this, check the unprocessed_data
            -- and processed_data jsonb objects, but not original_data
            WITH referenced AS (
              -- fetch ids for files uploaded by users and referenced in submissions
              SELECT (fil->>'fileId')::uuid AS file_id              
              FROM sequence_entries,
                 LATERAL jsonb_each(COALESCE(unprocessed_data->'files','{}'::jsonb)) AS cat(k,v),
                 LATERAL jsonb_array_elements(cat.v) AS fil
              UNION
              -- fetch ids for files produced by preprocessing.
              -- For these, we consider only files referenced by the current pipeline 
              -- version or newer. 
              -- (newer than current versions will only exist during rollouts)
              SELECT (fil->>'fileId')::uuid AS file_id
              FROM sequence_entries_preprocessed_data sepd
              JOIN sequence_entries se
                  ON se.accession = sepd.accession
                 AND se.version   = sepd.version
              JOIN current_processing_pipeline cpp
                  ON cpp.organism = se.organism
                 AND sepd.pipeline_version >= cpp.version,
                 LATERAL jsonb_each(COALESCE(sepd.processed_data->'files','{}'::jsonb)) AS cat(k,v),
                 LATERAL jsonb_array_elements(cat.v) AS fil
            )
            SELECT f.id FROM files f
              LEFT JOIN referenced r ON r.file_id = f.id
              WHERE r.file_id IS NULL
                  AND f.upload_requested_at < ?;
        """.trimIndent()
        return transaction {
            exec(sql, listOf(KotlinLocalDateTimeColumnType() to threshold),
                explicitStatementType = StatementType.SELECT) { rs ->
                val ids = mutableSetOf<FileId>()
                while (rs.next()) {
                    ids += rs.getObject("id", UUID::class.java)
                }
                ids
            } ?: emptySet()
        }
    }

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
