package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.wrapAsExpression
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.toPairs
import org.loculus.backend.service.jacksonSerializableJsonb

const val SEQUENCE_ENTRIES_TABLE_NAME = "sequence_entries"

object SequenceEntriesTable : Table(SEQUENCE_ENTRIES_TABLE_NAME) {
    val originalDataColumn = jacksonSerializableJsonb<OriginalData<CompressedSequence>>("original_data").nullable()

    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val versionCommentColumn = varchar("version_comment", 255).nullable()
    val organismColumn = varchar("organism", 255)
    val submissionIdColumn = varchar("submission_id", 255)
    val submitterColumn = varchar("submitter", 255)
    val approverColumn = varchar("approver", 255)
    val groupIdColumn = integer("group_id")
    val submittedAtTimestampColumn = datetime("submitted_at")
    val releasedAtTimestampColumn = datetime("released_at").nullable()
    val isRevocationColumn = bool("is_revocation").default(false)

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn)

    val isMaxVersion = versionColumn eq maxVersionQuery()

    private fun maxVersionQuery(): Expression<Long?> {
        val subQueryTable = alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .select(subQueryTable[versionColumn].max())
                .where { subQueryTable[accessionColumn] eq accessionColumn },
        )
    }

    fun distinctOrganisms() = SequenceEntriesTable
        .select(SequenceEntriesTable.organismColumn)
        .withDistinct()
        .asSequence()
        .map {
            it[SequenceEntriesTable.organismColumn]
        }

    fun accessionVersionIsIn(accessionVersions: List<AccessionVersionInterface>) =
        Pair(accessionColumn, versionColumn) inList accessionVersions.toPairs()

    fun organismIs(organism: Organism) = organismColumn eq organism.name

    fun groupIsOneOf(groupIds: List<Int>) = SequenceEntriesView.groupIdColumn inList groupIds
}
