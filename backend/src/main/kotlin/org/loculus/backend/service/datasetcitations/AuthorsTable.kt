package org.loculus.backend.service.datasetcitations

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

object AuthorsTable : Table("authors") {
    val authorId = uuid("author_id").autoGenerate()

    val name = varchar("name", 255)
    val affiliation = varchar("affiliation", 255)
    val email = varchar("email", 255)
    val username = varchar("username", 255).nullable()
    val emailVerified = bool("email_verified").default(false)
    val isPublic = bool("is_public").default(false)

    val createdAt = datetime("created_at")
    val createdBy = varchar("created_by", 255)
    val updatedAt = datetime("updated_at")
    val updatedBy = varchar("updated_by", 255)

    override val primaryKey = PrimaryKey(authorId)
}
