package org.loculus.api.audit

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.jdbc.insert
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Writes to the same `audit_log` table as the backend. Keep descriptions in the same format as the backend,
 * because migrations (e.g. backend V1.25) have parsed them before.
 */
@Component
@Transactional
class AuditLogger {
    fun log(username: String, description: String) {
        AuditLogTable.insert {
            it[usernameColumn] = username
            it[descriptionColumn] = description
        }
    }
}

object AuditLogTable : Table("audit_log") {
    val usernameColumn = text("username").nullable()
    val descriptionColumn = text("description")
}
