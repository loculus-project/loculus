package org.loculus.backend.log

import org.jetbrains.exposed.sql.insert
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
@Transactional
class AuditLogger {

    fun log(description: String) {
        AuditLogTable.insert {
            it[descriptionColumn] = description
        }
    }

    fun log(username: String, description: String) {
        AuditLogTable.insert {
            it[usernameColumn] = username
            it[descriptionColumn] = description
        }
    }
}
