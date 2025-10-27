@file:Suppress("ktlint:standard:filename", "ktlint:standard:class-naming")

package org.loculus.backend.db.migration

import mu.KotlinLogging
import org.flywaydb.core.api.migration.BaseJavaMigration
import org.flywaydb.core.api.migration.Context
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.service.jacksonSerializableJsonb
import org.loculus.backend.service.submission.CompressionDictService
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version
import org.springframework.stereotype.Component

private val log = KotlinLogging.logger { }

@Component
class V1_18_1__Migrate_Sequence_Entries_To_Use_Compression_Dict(
    private val compressionDictService: CompressionDictService,
) : BaseJavaMigration() {

    override fun migrate(context: Context) {
        log.info { "Starting migration" }

        val db = Database.connect(context.configuration.dataSource)

        var i = 0

        transaction(db) {
            V1_18_1_SequenceEntriesTable
                .select(
                    V1_18_1_SequenceEntriesTable.accessionColumn,
                    V1_18_1_SequenceEntriesTable.versionColumn,
                    V1_18_1_SequenceEntriesTable.organismColumn,
                    V1_18_1_SequenceEntriesTable.originalDataColumn,
                )
                .fetchSize(1000)
                .forEach { row ->
                    val accession = row[V1_18_1_SequenceEntriesTable.accessionColumn]
                    val version = row[V1_18_1_SequenceEntriesTable.versionColumn]
                    val organism = row[V1_18_1_SequenceEntriesTable.organismColumn]
                    val originalData = row[V1_18_1_SequenceEntriesTable.originalDataColumn] ?: return@forEach

                    val migratedOriginalData = OriginalData(
                        metadata = originalData.metadata,
                        files = originalData.files,
                        unalignedNucleotideSequences = originalData.unalignedNucleotideSequences.mapValues {
                            val value = it.value
                            when {
                                value == null -> null
                                value.compressionDictId !== null -> value
                                else -> CompressedSequence(
                                    compressedSequence = value.compressedSequence,
                                    compressionDictId = compressionDictService
                                        .getDictForUnalignedSequence(Organism(organism))
                                        ?.id,
                                )
                            }
                        },
                    )

                    V1_18_1_SequenceEntriesTable.update(
                        where = {
                            V1_18_1_SequenceEntriesTable.accessionVersionIs(
                                accession = accession,
                                version = version,
                            )
                        },
                    ) {
                        it[V1_18_1_SequenceEntriesTable.originalDataColumn] = migratedOriginalData
                    }

                    if (++i % 1000 == 0) {
                        log.info { "Migrated $i sequence entries (originalData)" }
                    }
                }
            log.info { "Migrated $i sequence entries (originalData) - done" }

            var j = 0

            V1_18_1_SequenceEntriesPreprocessedDataTable
                .join(
                    V1_18_1_SequenceEntriesTable,
                    joinType = JoinType.INNER,
                    additionalConstraint = {
                        (
                            V1_18_1_SequenceEntriesPreprocessedDataTable.accessionColumn eq
                                V1_18_1_SequenceEntriesTable.accessionColumn
                            ) and
                            (
                                V1_18_1_SequenceEntriesPreprocessedDataTable.versionColumn eq
                                    V1_18_1_SequenceEntriesTable.versionColumn
                                )
                    },
                )
                .select(
                    V1_18_1_SequenceEntriesPreprocessedDataTable.accessionColumn,
                    V1_18_1_SequenceEntriesPreprocessedDataTable.versionColumn,
                    V1_18_1_SequenceEntriesPreprocessedDataTable.pipelineVersionColumn,
                    V1_18_1_SequenceEntriesTable.organismColumn,
                    V1_18_1_SequenceEntriesPreprocessedDataTable.processedDataColumn,
                )
                .fetchSize(1000)
                .forEach { row ->
                    val accession = row[V1_18_1_SequenceEntriesPreprocessedDataTable.accessionColumn]
                    val version = row[V1_18_1_SequenceEntriesPreprocessedDataTable.versionColumn]
                    val pipelineVersion = row[V1_18_1_SequenceEntriesPreprocessedDataTable.pipelineVersionColumn]
                    val organism = row[V1_18_1_SequenceEntriesTable.organismColumn]
                    val processedData =
                        row[V1_18_1_SequenceEntriesPreprocessedDataTable.processedDataColumn] ?: return@forEach

                    val migratedProcessedData = ProcessedData(
                        metadata = processedData.metadata,
                        files = processedData.files,
                        unalignedNucleotideSequences = processedData.unalignedNucleotideSequences.mapValues {
                            val value = it.value
                            when {
                                value == null -> null
                                value.compressionDictId !== null -> value
                                else -> CompressedSequence(
                                    compressedSequence = value.compressedSequence,
                                    compressionDictId = compressionDictService
                                        .getDictForSegmentOrGene(Organism(organism), it.key)
                                        ?.id,
                                )
                            }
                        },
                        alignedNucleotideSequences = processedData.alignedNucleotideSequences.mapValues {
                            val value = it.value
                            when {
                                value == null -> null
                                value.compressionDictId !== null -> value
                                else -> CompressedSequence(
                                    compressedSequence = value.compressedSequence,
                                    compressionDictId = compressionDictService
                                        .getDictForSegmentOrGene(Organism(organism), it.key)
                                        ?.id,
                                )
                            }
                        },
                        alignedAminoAcidSequences = processedData.alignedAminoAcidSequences.mapValues {
                            val value = it.value
                            when {
                                value == null -> null
                                value.compressionDictId !== null -> value
                                else -> CompressedSequence(
                                    compressedSequence = value.compressedSequence,
                                    compressionDictId = compressionDictService
                                        .getDictForSegmentOrGene(Organism(organism), it.key)
                                        ?.id,
                                )
                            }
                        },
                        nucleotideInsertions = processedData.nucleotideInsertions,
                        aminoAcidInsertions = processedData.aminoAcidInsertions,
                    )

                    V1_18_1_SequenceEntriesPreprocessedDataTable.update(
                        where = {
                            (V1_18_1_SequenceEntriesPreprocessedDataTable.accessionColumn eq accession) and
                                (V1_18_1_SequenceEntriesPreprocessedDataTable.versionColumn eq version) and
                                (
                                    V1_18_1_SequenceEntriesPreprocessedDataTable.pipelineVersionColumn eq
                                        pipelineVersion
                                    )
                        },
                    ) {
                        it[V1_18_1_SequenceEntriesPreprocessedDataTable.processedDataColumn] =
                            migratedProcessedData
                    }

                    if (++j % 1000 == 0) {
                        log.info { "Migrated $j sequence entries (processedData)" }
                    }
                }

            log.info { "Migrated $j sequence entries (processedData) - done" }
        }

        log.info { "Finished migration" }
    }
}

private data class CompressedSequence(val compressedSequence: String, val compressionDictId: Int?)

/**
 * Only contains the columns needed for this migration.
 * We need this so that this migration script is decoupled from the actual `SequenceEntriesTable` object,
 * in case that object changes in the future.
 * We expect that this script doesn't need to change.
 */
private object V1_18_1_SequenceEntriesTable : Table("sequence_entries") {
    val originalDataColumn =
        jacksonSerializableJsonb<OriginalData<CompressedSequence>>("original_data").nullable()

    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val organismColumn = varchar("organism", 255)

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn)

    fun accessionVersionIs(accession: Accession, version: Version) =
        (accessionColumn eq accession) and (versionColumn eq version)
}

/**
 * Only contains the columns needed for this migration.
 * We need this so that this migration script is decoupled from the actual `SequenceEntriesTable` object,
 * in case that object changes in the future.
 * We expect that this script doesn't need to change.
 */
private object V1_18_1_SequenceEntriesPreprocessedDataTable : Table("sequence_entries_preprocessed_data") {
    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val pipelineVersionColumn = long("pipeline_version")
    val processedDataColumn =
        jacksonSerializableJsonb<ProcessedData<CompressedSequence>>("processed_data").nullable()

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn, pipelineVersionColumn)
}
