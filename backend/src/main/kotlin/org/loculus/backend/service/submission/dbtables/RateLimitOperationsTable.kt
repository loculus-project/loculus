package org.loculus.backend.service.submission

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.datetime.datetime

const val RATE_LIMIT_OPERATIONS_TABLE_NAME = "rate_limit_operations"

enum class RateLimitedOperation {
    SUBMIT,
    REVISE,
    REVOKE,
    EDIT,
    CHANGE_DATA_USE_TERMS,
    REQUEST_FILE_UPLOAD,
}

/**
 * Log of write operations counted against [org.loculus.backend.config.SubmissionLimits].
 * Rows are never deleted by the backend, so deleting data does not free up quota.
 */
object RateLimitOperationsTable : Table(RATE_LIMIT_OPERATIONS_TABLE_NAME) {
    val idColumn = long("id").autoIncrement()
    val createdAtColumn = datetime("created_at")
    val operationColumn = enumerationByName<RateLimitedOperation>("operation", 64)
    val groupIdColumn = integer("group_id").nullable()
    val usernameColumn = text("username")

    /** Number of sequence entries or files affected by the operation. */
    val countColumn = long("count")

    override val primaryKey = PrimaryKey(idColumn)
}
