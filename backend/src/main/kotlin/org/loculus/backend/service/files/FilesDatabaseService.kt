package org.loculus.backend.service.files

import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.not
import org.jetbrains.exposed.sql.update
import org.loculus.backend.utils.DateProvider
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

    fun getGroupIds(fileIds: Set<FileId>): Map<FileId, Int> =
        FilesTable.select(FilesTable.idColumn, FilesTable.groupIdColumn)
            .where { FilesTable.idColumn inList fileIds }
            .associate { Pair(it[FilesTable.idColumn], it[FilesTable.groupIdColumn]) }

    /**
     * Return a mapping of file IDs and multipart upload IDs for the files for which multipart upload has been
     * initiated but not completed
     */
    fun getUncompletedMultipartUploadIds(fileIds: Set<FileId>): List<Pair<FileId, MultipartUploadId>> = FilesTable
        .select(FilesTable.idColumn, FilesTable.multipartUploadId)
        .where {
            FilesTable.idColumn inList fileIds and
                (FilesTable.multipartUploadId neq null) and
                (not(FilesTable.multipartCompleted))
        }
        .map { it[FilesTable.idColumn] to it[FilesTable.multipartUploadId]!! }

    /**
     * Return the subset of file IDs for which the file size hasn't been checked yet or
     * no file has been uploaded yet (and therefore there's no file size).
     */
    fun getUncheckedFileIds(fileIds: Set<FileId>): Set<FileId> = FilesTable
        .select(FilesTable.idColumn)
        .where { FilesTable.idColumn inList fileIds and (FilesTable.sizeColumn eq null) }
        .map { it[FilesTable.idColumn] }
        .toSet()

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
