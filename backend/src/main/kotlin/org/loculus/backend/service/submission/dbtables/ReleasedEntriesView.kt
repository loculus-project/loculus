package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.kotlin.datetime.date
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.wrapAsExpression
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.PreprocessingAnnotation
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.Status
import org.loculus.backend.api.toPairs
import org.loculus.backend.service.jacksonSerializableJsonb

const val RELEASED_ENTRIES_VIEW_NAME = "Released_Entries_View"

object ReleasedEntriesView : Table(RELEASED_ENTRIES_VIEW_NAME) {

    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val submissionIdColumn = varchar("submission_id", 255)
    val submitterColumn = varchar("submitter", 255)
    val approverColumn = varchar("approver", 255)
    val groupIdColumn = integer("group_id")
    val groupNameColumn = text("group_name")
    val processedDataWithExternalMetadataColumn =
        jacksonSerializableJsonb<ProcessedData<CompressedSequence>>("processed_data_with_external_metadata").nullable()
    val submittedAtTimestampColumn = datetime("submitted_at")
    val releasedAtTimestampColumn = datetime("released_at")
    val isRevocationColumn = bool("is_revocation").default(false)
    val versionCommentColumn = varchar("version_comment", 255).nullable()
    val dataUseTermsTypeColumn = varchar("data_use_terms", 255)
    val restrictedUntilColumn = date("restricted_until").nullable()
    val organismColumn = varchar("organism", 255)
    val pipelineVersionColumn = long(name = "pipeline_version")
}
