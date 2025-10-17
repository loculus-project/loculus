package org.loculus.backend.db.migration

import org.flywaydb.core.api.migration.BaseJavaMigration
import org.flywaydb.core.api.migration.Context
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.jacksonSerializableJsonb
import org.loculus.backend.service.submission.CompressionDictService
import org.loculus.backend.service.submission.SEQUENCE_ENTRIES_TABLE_NAME
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version
import org.springframework.stereotype.Component

@Component
class V1_16_1__Migrate_Sequence_Entries_To_Use_Compression_Dict(
    private val backendConfig: BackendConfig,
    private val compressionDictService: CompressionDictService,
) : BaseJavaMigration() {

    override fun migrate(context: Context) {
        println("---------------------------  V1_16_1__Migrate_Sequence_Entries_To_Use_Compression_Dict -------------------------------")
        println(backendConfig)

        val db = Database.connect(context.configuration.dataSource)

        transaction(db) {
            Pre1_16_1_SequenceEntriesTable
                .select(
                    Pre1_16_1_SequenceEntriesTable.accessionColumn,
                    Pre1_16_1_SequenceEntriesTable.versionColumn,
                    Pre1_16_1_SequenceEntriesTable.originalDataColumn,
                )
                .fetchBatchedResults(1000)
                .forEach { batch ->
                    for (row in batch) {
                        val accession = row[Pre1_16_1_SequenceEntriesTable.accessionColumn]
                        val version = row[Pre1_16_1_SequenceEntriesTable.versionColumn]
                        val organism = row[Pre1_16_1_SequenceEntriesTable.organismColumn]
                        val originalData = row[Pre1_16_1_SequenceEntriesTable.originalDataColumn] ?: continue

                        val migratedOriginalData = OriginalData(
                            metadata = originalData.metadata,
                            files = originalData.files,
                            unalignedNucleotideSequences = originalData.unalignedNucleotideSequences.mapValues {
                                when (val value = it.value) {
                                    null -> null
                                    else -> Post1_16_1_CompressedSequence(
                                        compressedSequence = value.compressedSequence,
                                        compressionDictId = compressionDictService
                                            .getDictForUnalignedSequence(Organism(organism))
                                            .id,
                                    )
                                }
                            },
                        )

                        Post1_16_1_SequenceEntriesTable.update(
                            where = {
                                SequenceEntriesTable.accessionVersionIs(
                                    accession = accession,
                                    version = version,
                                )
                            },
                        ) {
                            it[Post1_16_1_SequenceEntriesTable.originalDataColumn] = migratedOriginalData
                        }
                    }
                }

            for ((organism, instanceConfig) in backendConfig.organisms) {
                // Migrate unaligned sequences
                val unalignedDictEntry = compressionDictService.getDictForUnalignedSequence(Organism(organism))

                exec(
                    """
                    UPDATE sequence_entries_preprocessed
                    SET compression_dict_id = ?
                    WHERE organism = ?
                    """.trimIndent(),
                    listOf(unalignedDictEntry.id, organism),
                ) { }

                println("Migrated unaligned sequences for organism: $organism with dict_id: ${unalignedDictEntry.id}")

                // Migrate aligned sequences (segments and genes)
                val segmentsAndGenes =
                    instanceConfig.referenceGenome.nucleotideSequences + instanceConfig.referenceGenome.genes

                for (referenceSequence in segmentsAndGenes) {
                    val dictEntry = compressionDictService.getDictForSegmentOrGene(
                        Organism(organism),
                        referenceSequence.name,
                    ) ?: throw RuntimeException(
                        "No dict found for organism: $organism, segment/gene: ${referenceSequence.name}",
                    )

                    exec(
                        """
                        UPDATE sequence_entries
                        SET compression_dict_id = ?
                        WHERE organism = ? AND segment_name = ?
                        """.trimIndent(),
                        listOf(dictEntry.id, organism, referenceSequence.name),
                    ) { }

                    println("Migrated aligned sequences for organism: $organism, segment/gene: ${referenceSequence.name} with dict_id: ${dictEntry.id}")
                }
            }
        }

        println("--------------------------- End V1_16_1__Migrate_Sequence_Entries_To_Use_Compression_Dict -------------------------------")
    }
}

/**
 * Only contains the columns needed for this migration.
 * We need a separate table object so that the `originalDataColumn` still has the old JSON schema.
 */
object Pre1_16_1_SequenceEntriesTable : Table(SEQUENCE_ENTRIES_TABLE_NAME) {
    val originalDataColumn =
        jacksonSerializableJsonb<OriginalData<Pre1_16_1_CompressedSequence>>("original_data").nullable()

    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val organismColumn = varchar("organism", 255)

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn)
}

data class Pre1_16_1_CompressedSequence(val compressedSequence: String)


/**
 * We need this so that this migration script is decoupled from the actual `SequenceEntriesTable` object,
 * in case that object changes in the future.
 * We expect that this script doesn't need to change.
 */
object Post1_16_1_SequenceEntriesTable : Table(SEQUENCE_ENTRIES_TABLE_NAME) {
    val originalDataColumn =
        jacksonSerializableJsonb<OriginalData<Post1_16_1_CompressedSequence>>("original_data").nullable()

    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn)

    fun accessionVersionIs(accession: Accession, version: Version) =
        (SequenceEntriesTable.accessionColumn eq accession) and (SequenceEntriesTable.versionColumn eq version)
}

data class Post1_16_1_CompressedSequence(
    val compressedSequence: String,
    val compressionDictId: Int,
)
