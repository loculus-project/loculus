package org.loculus.backend.service.files

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import java.util.UUID

typealias FileId = UUID
const val FILES_TABLE_NAME = "files"

object FilesTable : Table(FILES_TABLE_NAME) {

    val idColumn = uuid("id")
    val requestedAtColumn = datetime("requested_at")
    val uploaderColumn = text("uploader")
    val groupIdColumn = integer("group_id")
}
