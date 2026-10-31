package org.loculus.backend.service.submission.dbtables

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.less
import org.jetbrains.exposed.v1.core.vendors.ForUpdateOption.PostgreSQL.ForShare
import org.jetbrains.exposed.v1.datetime.datetime
import org.jetbrains.exposed.v1.jdbc.andWhere
import org.jetbrains.exposed.v1.jdbc.batchInsert
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.update

const val CURRENT_PROCESSING_PIPELINE_TABLE_NAME = "current_processing_pipeline"

object CurrentProcessingPipelineTable : Table(CURRENT_PROCESSING_PIPELINE_TABLE_NAME) {
    val organismColumn = varchar("organism", 255)
    val versionColumn = long("version")
    val startedUsingAtColumn = datetime("started_using_at")

    // Registration and submissions share this organism's version row.
    // Retiring versions takes an exclusive row lock and waits for them.
    fun getVersionForShare(organism: String): Long = select(versionColumn)
        .where { organismColumn eq organism }
        .forUpdate(ForShare())
        .single()[versionColumn]

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
     * Lock the matching row FOR UPDATE to coordinate retirement with submissions and registration.
     */
    fun pipelineNeedsUpdate(maybeNewerVersion: Long, organism: String) = CurrentProcessingPipelineTable
        .selectAll()
        .where { versionColumn less maybeNewerVersion }
        .andWhere { organismColumn eq organism }
        .forUpdate()
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
