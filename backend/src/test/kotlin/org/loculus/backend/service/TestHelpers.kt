package org.loculus.backend.service

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.service.files.FilesTable
import org.loculus.backend.utils.DateProvider
import java.util.UUID
import kotlin.time.Clock

fun insertFile(id: UUID, groupId: Int, requestedAt: LocalDateTime, uploader: String = "testuser") = transaction {
    FilesTable.insert {
        it[idColumn] = id
        it[uploadRequestedAtColumn] = requestedAt
        it[uploaderColumn] = uploader
        it[groupIdColumn] = groupId
        it[multipartCompleted] = true
    }
}

fun daysAgo(days: Long): LocalDateTime = Clock.System.now()
    .minus(days, DateTimeUnit.DAY, DateProvider.timeZone)
    .toLocalDateTime(DateProvider.timeZone)
