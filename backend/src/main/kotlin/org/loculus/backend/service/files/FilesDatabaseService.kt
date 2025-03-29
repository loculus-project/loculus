package org.loculus.backend.service.files

import org.jetbrains.exposed.sql.insert
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
            it[requestedAtColumn] = now
            it[uploaderColumn] = uploader
            it[groupIdColumn] = groupId
        }
        return id
    }
}
