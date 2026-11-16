package org.loculus.backend.service.identity

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.java.javaUUID
import org.jetbrains.exposed.v1.datetime.datetime

/** Initial provider snapshot only. Refresh and user-managed contact addresses are follow-up work. */
object UserEmailTable : Table("user_emails") {
    val userId = javaUUID("user_id").references(LoculusUsersTable.id)
    val address = text("address")
    val verified = bool("verified").nullable()
    val sourceIssuer = text("source_issuer")
    val sourceSubject = text("source_subject")
    val importedAt = datetime("imported_at")
    override val primaryKey = PrimaryKey(userId)

    init {
        foreignKey(sourceIssuer, sourceSubject, target = ExternalIdentitiesTable.primaryKey)
    }
}
