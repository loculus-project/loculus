package org.loculus.backend.service.files

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.v1.core.IColumnType
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.inList
import org.jetbrains.exposed.v1.core.isNotNull
import org.jetbrains.exposed.v1.core.neq
import org.jetbrains.exposed.v1.core.not
import org.jetbrains.exposed.v1.core.statements.StatementType
import org.jetbrains.exposed.v1.datetime.KotlinLocalDateTimeColumnType
import org.jetbrains.exposed.v1.jdbc.batchInsert
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import org.loculus.backend.api.ExternalFile
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.chunkedForDatabase
import org.loculus.backend.utils.generateFileIds
import org.loculus.backend.utils.processInDatabaseSafeChunks
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

// Each row binds 7 parameters, stay well below PostgreSQL's limit of 65,535 parameters per query
private const val EXTERNAL_FILES_INSERT_CHUNK_SIZE = 5_000

@Service
@Transactional
class FilesDatabaseService(private val dateProvider: DateProvider) {

    fun createFileEntry(fileId: FileId, uploader: String, groupId: Int, multipartUploadId: String? = null) {
        val now = dateProvider.getCurrentDateTime()
        FilesTable.insert {
            it[idColumn] = fileId
            it[uploadRequestedAtColumn] = now
            it[uploaderColumn] = uploader
            it[groupIdColumn] = groupId
            it[FilesTable.multipartUploadId] = multipartUploadId
        }
    }

    fun createFileEntries(fileIds: List<FileId>, uploader: String, groupId: Int) {
        val now = dateProvider.getCurrentDateTime()
        fileIds.processInDatabaseSafeChunks { chunk ->
            FilesTable.batchInsert(chunk) { fileId ->
                this[FilesTable.idColumn] = fileId
                this[FilesTable.uploadRequestedAtColumn] = now
                this[FilesTable.uploaderColumn] = uploader
                this[FilesTable.groupIdColumn] = groupId
                // Exposed does not apply DB-side defaults in batch inserts, so this has to be set explicitly.
                this[FilesTable.multipartCompleted] = false
            }
        }
    }

    /**
     * Registers files hosted at external URLs for the given group and returns the file ID for each URL.
     * Idempotent: a URL that is already registered for the group keeps its existing file ID.
     */
    fun registerExternalFiles(externalFiles: List<ExternalFile>, uploader: String, groupId: Int): Map<String, FileId> {
        val distinctFiles = externalFiles.distinctBy { it.url }
        val existing = getExternalFileIds(distinctFiles.map { it.url }, groupId)
        val newFiles = distinctFiles.filterNot { it.url in existing }
        if (newFiles.isNotEmpty()) {
            val now = dateProvider.getCurrentDateTime()
            newFiles.zip(generateFileIds(newFiles.size)).chunked(EXTERNAL_FILES_INSERT_CHUNK_SIZE).forEach { chunk ->
                // Ignoring conflicts on the unique (group_id, external_url) index handles concurrent registrations
                FilesTable.batchInsert(chunk, ignore = true) { (externalFile, fileId) ->
                    this[FilesTable.idColumn] = fileId
                    this[FilesTable.uploadRequestedAtColumn] = now
                    this[FilesTable.uploaderColumn] = uploader
                    this[FilesTable.groupIdColumn] = groupId
                    this[FilesTable.sizeColumn] = externalFile.size
                    this[FilesTable.multipartCompleted] = false
                    this[FilesTable.externalUrlColumn] = externalFile.url
                }
            }
        }
        return existing + getExternalFileIds(newFiles.map { it.url }, groupId)
    }

    private fun getExternalFileIds(urls: List<String>, groupId: Int): Map<String, FileId> =
        urls.chunkedForDatabase({ chunk ->
            FilesTable.select(FilesTable.idColumn, FilesTable.externalUrlColumn)
                .where { (FilesTable.groupIdColumn eq groupId) and (FilesTable.externalUrlColumn inList chunk) }
                .map { it[FilesTable.externalUrlColumn]!! to it[FilesTable.idColumn] }
        }, 1).toMap()

    /**
     * Return the external URLs of those of the given file IDs that are external files.
     */
    fun getExternalUrls(fileIds: Set<FileId>): Map<FileId, String> = fileIds.chunkedForDatabase({ chunk ->
        FilesTable.select(FilesTable.idColumn, FilesTable.externalUrlColumn)
            .where { (FilesTable.idColumn inList chunk) and FilesTable.externalUrlColumn.isNotNull() }
            .map { it[FilesTable.idColumn] to it[FilesTable.externalUrlColumn]!! }
    }, 1).toMap()

    fun deleteFileEntry(fileId: FileId) {
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

    data class DeletionCandidateFile(val id: FileId, val markedForDeletionAt: LocalDateTime?)

    fun getDeletionCandidateFiles(threshold: LocalDateTime): List<DeletionCandidateFile> {
        val sql = """
            -- check for files not referenced by a submission. For this, check the submitted_data,
            -- archive_of_submitted_data and processed_data jsonb objects
            WITH referenced AS (
                -- fetch ids for files uploaded by users and referenced in submissions
                SELECT (fil->>'fileId') AS file_id
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
                SELECT (fil->>'fileId') AS file_id
                FROM sequence_entries_preprocessed_data sepd
                JOIN sequence_entries se
                    ON se.accession = sepd.accession
                    AND se.version   = sepd.version,
                    LATERAL jsonb_each(COALESCE(NULLIF(sepd.processed_data->'files', 'null'::jsonb),'{}'::jsonb)) AS cat(k,v),
                    LATERAL jsonb_array_elements(cat.v) AS fil
            )
            -- external files are excluded: there is nothing to delete in S3, and keeping the rows means
            -- re-registering a URL always returns the same file ID
            SELECT f.id, f.marked_for_deletion_at FROM files f
              LEFT JOIN referenced r ON r.file_id = f.id
              WHERE r.file_id IS NULL
                    AND f.external_url IS NULL
                    AND f.upload_requested_at < ?;
        """.trimIndent()
        return transaction {
            exec(
                sql,
                listOf<Pair<IColumnType<*>, Any?>>(Pair(KotlinLocalDateTimeColumnType(), threshold)),
                explicitStatementType = StatementType.SELECT,
            ) { rs ->
                buildList<DeletionCandidateFile> {
                    while (rs.next()) {
                        val id = rs.getString("id")
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
                        add(DeletionCandidateFile(id, markedAt))
                    }
                }
            } ?: emptyList()
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

    fun filterMarkedForDeletionFileIds(fileIds: Set<FileId>): Set<FileId> = fileIds.chunkedForDatabase({ chunk ->
        FilesTable
            .select(FilesTable.idColumn)
            .where { FilesTable.idColumn inList chunk and FilesTable.markedForDeletionAtColumn.isNotNull() }
            .map { it[FilesTable.idColumn] }
    }, 1).toSet()

    /**
     * Return the subset of file IDs for which the file size hasn't been checked yet or
     * no file has been uploaded yet (and therefore there's no file size).
     * External files are never uploaded to S3, so they are not included.
     */
    fun getUncheckedFileIds(fileIds: Set<FileId>): Set<FileId> = fileIds.chunkedForDatabase({ chunk ->
        FilesTable
            .select(FilesTable.idColumn)
            .where {
                FilesTable.idColumn inList chunk and
                    (FilesTable.sizeColumn eq null) and
                    (FilesTable.externalUrlColumn eq null)
            }
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
