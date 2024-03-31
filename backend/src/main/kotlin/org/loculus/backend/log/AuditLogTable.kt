package org.loculus.backend.log

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

const val AUDIT_LOG_TABLE_NAME = "audit_log"

object AuditLogTable : Table(AUDIT_LOG_TABLE_NAME) {

    val idColumn = long("id")
    val usernameColumn = text("username").nullable()
    val timestampColumn = datetime("timestamp")
    val descriptionColumn = text("description")
}
