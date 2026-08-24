package org.loculus.backend.service.submission

import org.jetbrains.exposed.v1.core.Expression
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.alias
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.inList
import org.jetbrains.exposed.v1.core.max
import org.jetbrains.exposed.v1.core.wrapAsExpression
import org.jetbrains.exposed.v1.datetime.datetime
import org.jetbrains.exposed.v1.jdbc.select
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.Organism
import org.loculus.backend.api.SubmittedData
import org.loculus.backend.api.toPairs
import org.loculus.backend.service.jacksonSerializableJsonb

const val SEQUENCE_ENTRIES_TABLE_NAME = "sequence_entries"

object SequenceEntriesTable : Table(SEQUENCE_ENTRIES_TABLE_NAME) {
    val archiveOfSubmittedDataColumn = jacksonSerializableJsonb<SubmittedData<CompressedSequence>>(
        "archive_of_submitted_data",
    ).nullable()
    val submittedDataColumn = jacksonSerializableJsonb<SubmittedData<CompressedSequence>>(
        "submitted_data",
    ).nullable()

    val accessionColumn = text("accession")
    val versionColumn = long("version")
    val organismColumn = text("organism")
    val submissionIdColumn = text("submission_id")
    val submitterColumn = text("submitter")
    val approverColumn = text("approver")
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
