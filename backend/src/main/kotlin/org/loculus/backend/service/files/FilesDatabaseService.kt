package org.loculus.backend.service.files

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.not
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.fileIds
import org.loculus.backend.service.submission.MetadataUploadAuxTable
import org.loculus.backend.service.submission.SequenceEntriesPreprocessedDataTable
import org.loculus.backend.service.submission.SequenceEntriesTable
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

    /**
     * Returns all file IDs that were uploaded (requested) before the given threshold.
     */
    fun getOldFileIds(uploadRequestedBefore: LocalDateTime): Set<FileId> = FilesTable
        .select(FilesTable.idColumn)
        .where { FilesTable.uploadRequestedAtColumn less uploadRequestedBefore }
        .map { it[FilesTable.idColumn] }
        .toSet()

    /**
     * Returns all file IDs that are referenced in sequence entries (original_data and processed_data)
     * and in the metadata upload aux table.
     */
    fun getReferencedFileIds(): Set<FileId> {
        val referencedFileIds = mutableSetOf<FileId>()

        // Get file IDs from sequence_entries.original_data
        SequenceEntriesTable
            .select(SequenceEntriesTable.originalDataColumn)
            .where { SequenceEntriesTable.originalDataColumn neq null }
            .forEach { row ->
                row[SequenceEntriesTable.originalDataColumn]?.files?.let { filesMap ->
                    referencedFileIds.addAll(filesMap.fileIds)
                }
            }

        // Get file IDs from sequence_entries_preprocessed_data.processed_data
        SequenceEntriesPreprocessedDataTable
            .select(SequenceEntriesPreprocessedDataTable.processedDataColumn)
            .where { SequenceEntriesPreprocessedDataTable.processedDataColumn neq null }
            .forEach { row ->
                row[SequenceEntriesPreprocessedDataTable.processedDataColumn]?.files?.let { filesMap ->
                    referencedFileIds.addAll(filesMap.fileIds)
                }
            }

        // Get file IDs from metadata_upload_aux_table.files
        MetadataUploadAuxTable
            .select(MetadataUploadAuxTable.filesColumn)
            .where { MetadataUploadAuxTable.filesColumn neq null }
            .forEach { row ->
                row[MetadataUploadAuxTable.filesColumn]?.let { filesMap ->
                    referencedFileIds.addAll(filesMap.fileIds)
                }
            }

        return referencedFileIds
    }

    /**
     * Deletes files from the files table by their IDs.
     * Returns the number of files deleted.
     */
    fun deleteFiles(fileIds: Set<FileId>): Int {
        var totalDeleted = 0
        fileIds.chunkedForDatabase<FileId, Int>({ chunk ->
            totalDeleted += FilesTable.deleteWhere { FilesTable.idColumn inList chunk }
            emptyList()
        }, 1)
        return totalDeleted
    }
}
