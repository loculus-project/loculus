package org.pathoplexus.backend.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.Sequence
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.wrapAsExpression
import org.pathoplexus.backend.api.AccessionVersionInterface
import org.pathoplexus.backend.api.Organism
import org.pathoplexus.backend.api.OriginalData
import org.pathoplexus.backend.api.PreprocessingAnnotation
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.toPairs

private val jacksonObjectMapper = jacksonObjectMapper().findAndRegisterModules()

private inline fun <reified T : Any> Table.jacksonSerializableJsonb(columnName: String) = jsonb<T>(
    columnName,
    { value -> jacksonObjectMapper.writeValueAsString(value) },
    { string -> jacksonObjectMapper.readValue(string) },
)

typealias Accession = String
typealias Version = Long

object AccessionComparator : Comparator<Accession> {
    override fun compare(left: Accession, right: Accession): Int {
        return left.toInt().compareTo(right.toInt())
    }
}

object AccessionVersionComparator : Comparator<AccessionVersionInterface> {
    override fun compare(left: AccessionVersionInterface, right: AccessionVersionInterface): Int {
        return when (val accessionResult = left.accession.toInt().compareTo(right.accession.toInt())) {
            0 -> left.version.compareTo(right.version)
            else -> accessionResult
        }
    }
}

const val ACCESSION_SEQUENCE_NAME = "accession_sequence"

val accessionSequence = Sequence(ACCESSION_SEQUENCE_NAME)

const val TABLE_NAME = "sequence_entries"

object SequenceEntriesTable : Table(TABLE_NAME) {
    val accession = varchar("accession", 255)
    val version = long("version")
    val organism = varchar("organism", 255)
    val submissionId = varchar("submission_id", 255)
    val submitter = varchar("submitter", 255)
    val submittedAt = datetime("submitted_at")
    val startedProcessingAt = datetime("started_processing_at").nullable()
    val finishedProcessingAt = datetime("finished_processing_at").nullable()
    val status = varchar("status", 255)
    val isRevocation = bool("is_revocation").default(false)
    val originalData =
        jacksonSerializableJsonb<OriginalData>("original_data").nullable()
    val processedData = jacksonSerializableJsonb<ProcessedData>("processed_data").nullable()
    val errors = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("errors").nullable()
    val warnings = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("warnings").nullable()

    override val primaryKey = PrimaryKey(accession, version)
}

val isMaxVersion = SequenceEntriesTable.version eq maxVersionQuery()

private fun maxVersionQuery(): Expression<Long?> {
    val subQueryTable = SequenceEntriesTable.alias("subQueryTable")
    return wrapAsExpression(
        subQueryTable
            .slice(subQueryTable[SequenceEntriesTable.version].max())
            .select { subQueryTable[SequenceEntriesTable.accession] eq SequenceEntriesTable.accession },
    )
}

val isMaxReleasedVersion = SequenceEntriesTable.version eq maxReleasedVersionQuery()

private fun maxReleasedVersionQuery(): Expression<Long?> {
    val subQueryTable = SequenceEntriesTable.alias("subQueryTable")
    return wrapAsExpression(
        subQueryTable
            .slice(subQueryTable[SequenceEntriesTable.version].max())
            .select {
                (subQueryTable[SequenceEntriesTable.accession] eq SequenceEntriesTable.accession) and
                    (subQueryTable[SequenceEntriesTable.status] eq Status.APPROVED_FOR_RELEASE.name)
            },
    )
}

fun accessionVersionIsIn(accessionVersions: List<AccessionVersionInterface>) =
    Pair(SequenceEntriesTable.accession, SequenceEntriesTable.version) inList accessionVersions.toPairs()

fun organismIs(organism: Organism) = SequenceEntriesTable.organism eq organism.name

fun statusIs(status: Status) = SequenceEntriesTable.status eq status.name

fun statusIsOneOf(vararg status: Status) = SequenceEntriesTable.status inList status.map { it.name }

fun accessionVersionEquals(accessionVersion: AccessionVersionInterface) =
    (SequenceEntriesTable.accession eq accessionVersion.accession) and
        (SequenceEntriesTable.version eq accessionVersion.version)

fun submitterIs(submitter: String) = SequenceEntriesTable.submitter eq submitter
