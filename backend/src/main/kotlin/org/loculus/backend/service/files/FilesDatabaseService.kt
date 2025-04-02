package org.loculus.backend.service.files

import org.jetbrains.exposed.sql.insert
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.*
import kotlin.collections.HashSet

@Service
@Transactional
class FilesDatabaseService(private val dateProvider: DateProvider) {

    fun createFileEntry(uploader: String, groupId: Int): FileId {
        val id = UUID.randomUUID()
        val now = dateProvider.getCurrentDateTime()
        FilesTable.insert {
            it[idColumn] = id
            it[requestedAtColumn] = now
            it[uploaderColumn] = uploader
            it[groupIdColumn] = groupId
        }
        return id
    }

    /**
     * Takes a list of File IDs and returns the subset of file IDs that do not exist in the database.
     * If the resulting Set is empty, all given File IDs exist.
     */
    fun notExistingIds(fileIds: List<FileId>): Set<FileId> {
        val uniqueIds = HashSet(fileIds)
        val uniqueCount = uniqueIds.size.toLong()
        val existingIds = FilesTable.select(FilesTable.idColumn).where {
            FilesTable.idColumn inList uniqueIds
        }.map { it[FilesTable.idColumn] }
        val nonExistingIds = uniqueIds.subtract(existingIds.toSet())
        return nonExistingIds
    }
}
