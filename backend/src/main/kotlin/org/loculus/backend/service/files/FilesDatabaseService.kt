package org.loculus.backend.service.files

import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.update
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.*

@Service
@Transactional
class FilesDatabaseService(private val dateProvider: DateProvider) {

    fun createFileEntry(uploader: String, groupId: Int): FileId {
        val id = UUID.randomUUID()
        val now = dateProvider.getCurrentDateTime()
        FilesTable.insert {
            it[idColumn] = id
            it[uploadRequestedAtColumn] = now
            it[uploaderColumn] = uploader
            it[groupIdColumn] = groupId
        }
        return id
    }

    fun getGroupId(fileId: FileId): Int? = getGroupIds(setOf(fileId))[fileId]

    fun getGroupIds(fileIds: Set<FileId>): Map<FileId, Int> =
        FilesTable.select(FilesTable.idColumn, FilesTable.groupIdColumn)
            .where { FilesTable.idColumn inList fileIds }
            .associate { Pair(it[FilesTable.idColumn], it[FilesTable.groupIdColumn]) }

    /**
     * Set the release date for all given file IDs to now, if they are not set already.
     */
    fun release(fileIds: Set<FileId>) {
        val now = dateProvider.getCurrentDateTime()
        FilesTable.update({
            FilesTable.idColumn inList fileIds and (FilesTable.releasedAtColumn.isNull())
        }) {
            it[releasedAtColumn] = now
        }
    }

    fun isFilePublic(fileId: FileId): Boolean? = FilesTable
        .select(FilesTable.releasedAtColumn)
        .where { FilesTable.idColumn eq fileId }
        .map { it[FilesTable.releasedAtColumn] }
        .first()
        .let { it != null }
}
