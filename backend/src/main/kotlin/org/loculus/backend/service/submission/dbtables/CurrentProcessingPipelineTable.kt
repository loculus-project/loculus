package org.loculus.backend.service.submission.dbtables

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.and
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
     * Set the pipeline version for the given organism to newVersion (only if it isn't already set)
     */
    fun tryUpdatePipelineVersion(organism: String, newVersion: Long, startedUsingAt: LocalDateTime): Boolean =
        CurrentProcessingPipelineTable.update(
            where = { (organismColumn eq organism) and (versionColumn less newVersion) },
        ) {
            it[versionColumn] = newVersion
            it[startedUsingAtColumn] = startedUsingAt
        } > 0

    /** Get the current pipeline version for the given organism */
    fun getCurrentPipelineVersion(organism: String): Long? =
        CurrentProcessingPipelineTable.selectAll()
            .andWhere { organismColumn eq organism }
            .map { it[versionColumn] }
            .firstOrNull()
}
