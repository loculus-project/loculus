package org.loculus.backend.service.datasetcitations

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

private val jacksonObjectMapper = jacksonObjectMapper().findAndRegisterModules()

private inline fun <reified T : Any> Table.jacksonSerializableJsonb(columnName: String) = jsonb<T>(
    columnName,
    { value -> jacksonObjectMapper.writeValueAsString(value) },
    { string -> jacksonObjectMapper.readValue(string) },
)

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
