package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.sql.Column
import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.QueryBuilder
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.Transaction
import org.jetbrains.exposed.sql.kotlin.datetime.date
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.selectAll
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.service.jacksonSerializableJsonb
import org.loculus.backend.service.submission.CompressedSequence

/**
 * Typed binding over get_released_submissions(p_organism text).
 */
class ReleasedSubmissionsFunction(private val organism: Organism) : Table() {
    val accession: Column<String> = text("accession")
    val version: Column<Long> = long("version")
    val isRevocation: Column<Boolean> = bool("is_revocation")
    val versionComment: Column<String?> = text("version_comment").nullable()
    val jointMetadata = jacksonSerializableJsonb<ProcessedData<CompressedSequence>>("joint_metadata").nullable()
    val submitter: Column<String> = text("submitter")
    val groupId: Column<Int> = integer("group_id")
    val submittedAt = datetime("submitted_at")
    val releasedAt = datetime("released_at")
    val submissionId: Column<String> = text("submission_id")
    val pipelineVersion: Column<Long> = long("pipeline_version")
    val dataUseTermsType: Column<String> = text("data_use_terms_type")
    val restrictedUntil = date("restricted_until").nullable()

    override fun describe(s: Transaction, queryBuilder: QueryBuilder) {
        // Exposed doesn't bind parameters in ColumnSet.describe, so inline safe organism literal
        val escapedOrganism = organism.name.replace("'", "''")
        queryBuilder.append("get_released_submissions('")
        queryBuilder.append(escapedOrganism)
        queryBuilder.append("')")
    }

    fun query(): Query = selectAll().orderBy(accession to SortOrder.ASC, version to SortOrder.ASC)
}
