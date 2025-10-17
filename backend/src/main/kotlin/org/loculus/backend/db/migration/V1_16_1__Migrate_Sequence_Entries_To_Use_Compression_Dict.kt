package org.loculus.backend.db.migration

import org.flywaydb.core.api.migration.BaseJavaMigration
import org.flywaydb.core.api.migration.Context
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.submission.CompressionDictService
import org.springframework.stereotype.Component

@Component
class V1_16_1__Migrate_Sequence_Entries_To_Use_Compression_Dict(
    private val backendConfig: BackendConfig,
    private val compressionDictService: CompressionDictService
) : BaseJavaMigration() {

    override fun migrate(context: Context) {
        println("---------------------------  V1_16_1__Migrate_Sequence_Entries_To_Use_Compression_Dict -------------------------------")
        println(backendConfig)

        val db = Database.connect(context.configuration.dataSource)

        // TODO vibe wip - check!
        transaction(db) {
            for ((organism, instanceConfig) in backendConfig.organisms) {
                // Migrate unaligned sequences
                val unalignedDictEntry = compressionDictService.getDictForUnalignedSequence(Organism(organism))
                    ?: throw RuntimeException("No unaligned dict found for organism: $organism")

                exec(
                    """
                    UPDATE sequence_entries_preprocessed
                    SET compression_dict_id = ?
                    WHERE organism = ?
                    """.trimIndent(),
                    listOf(unalignedDictEntry.id, organism)
                ) { }

                println("Migrated unaligned sequences for organism: $organism with dict_id: ${unalignedDictEntry.id}")

                // Migrate aligned sequences (segments and genes)
                val segmentsAndGenes =
                    instanceConfig.referenceGenome.nucleotideSequences + instanceConfig.referenceGenome.genes

                for (referenceSequence in segmentsAndGenes) {
                    val dictEntry = compressionDictService.getDictForSegmentOrGene(
                        Organism(organism),
                        referenceSequence.name
                    ) ?: throw RuntimeException(
                        "No dict found for organism: $organism, segment/gene: ${referenceSequence.name}"
                    )

                    exec(
                        """
                        UPDATE sequence_entries
                        SET compression_dict_id = ?
                        WHERE organism = ? AND segment_name = ?
                        """.trimIndent(),
                        listOf(dictEntry.id, organism, referenceSequence.name)
                    ) { }

                    println("Migrated aligned sequences for organism: $organism, segment/gene: ${referenceSequence.name} with dict_id: ${dictEntry.id}")
                }
            }
        }

        println("--------------------------- End V1_16_1__Migrate_Sequence_Entries_To_Use_Compression_Dict -------------------------------")
    }
}
