package org.loculus.backend.service.submission

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.update

const val CURRENT_PROCESSING_PIPELINE_TABLE_NAME = "current_processing_pipeline"

object CurrentProcessingPipelineTable : Table(CURRENT_PROCESSING_PIPELINE_TABLE_NAME) {
    val organismColumn = varchar("organism", 255)
    val versionColumn = long("version")
    val startedUsingAtColumn = datetime("started_using_at")

    // TODO -> will this fn insert v1 rows if we're already at v2?
    // I think we want to maintain only a single row for each organism.
    // Having only a single row is also important for the SQL view definitions.
    // UPDATE:
    fun setV1ForOrganismsIfNotExist(organisms: Collection<String>, now: LocalDateTime) =
        CurrentProcessingPipelineTable.batchInsert(organisms, ignore = true) { organism ->
            this[organismColumn] = organism
            this[versionColumn] = 1
            this[startedUsingAtColumn] = now
        }

    fun pipelineNeedsUpdate(foundVersion: Long, organism: String) = CurrentProcessingPipelineTable
        .selectAll()
        .where { versionColumn less foundVersion }
        .andWhere { organismColumn eq organism }
        .limit(1)
        .empty()
        .not()

    /**
     * Set the pipeline version for the given organism to newVersion.
     */
    fun updatePipelineVersion(organism: String, newVersion: Long, startedUsingAt: LocalDateTime) =
        CurrentProcessingPipelineTable.update(
            where = {
                organismColumn eq organism
            },
        ) {
            it[versionColumn] = newVersion
            it[startedUsingAtColumn] = startedUsingAt
        }
}
