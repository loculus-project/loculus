package org.loculus.backend.service.submission.dbtables

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

    /**
     * Every organism needs to have a current pipeline version in the CurrentProcessingPipelineTable.
     * This function sets V1 for all given organisms, if no version is defined yet.
     */
    fun setV1ForOrganismsIfNotExist(organisms: Collection<String>, now: LocalDateTime) =
        CurrentProcessingPipelineTable.batchInsert(organisms, ignore = true) { organism ->
            this[organismColumn] = organism
            this[versionColumn] = 1
            this[startedUsingAtColumn] = now
        }

    /**
     * Given a version that was found that is potentially newer than the current one, check if the currently stored
     * 'current' pipeline version for this organism is less than the one that was found?
     * If so, the pipeline needs to 'update' i.e. reprocess older entries.
     */
    fun pipelineNeedsUpdate(maybeNewerVersion: Long, organism: String) = CurrentProcessingPipelineTable
        .selectAll()
        .where { versionColumn less maybeNewerVersion }
        .andWhere { organismColumn eq organism }
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
