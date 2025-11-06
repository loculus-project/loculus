@file:Suppress("ktlint:standard:filename", "ktlint:standard:class-naming")

package org.loculus.backend.db.migration

import mu.KotlinLogging
import org.flywaydb.core.api.migration.BaseJavaMigration
import org.flywaydb.core.api.migration.Context
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.Organism
import org.loculus.backend.service.submission.CompressionDictService
import org.springframework.stereotype.Component

private val log = KotlinLogging.logger { }

@Component
class V1_18_1__Migrate_Sequence_Entries_To_Use_Compression_Dict(
    private val compressionDictService: CompressionDictService,
) : BaseJavaMigration() {

    override fun migrate(context: Context) {
        log.info { "Starting migration" }

        val db = Database.connect(context.configuration.dataSource)

        transaction(db) {
            // Get all distinct organisms
            val organisms = mutableSetOf<String>()
            exec("SELECT DISTINCT organism FROM sequence_entries WHERE original_data IS NOT NULL") { rs ->
                while (rs.next()) {
                    organisms.add(rs.getString(1))
                }
            }

            log.info { "Found ${organisms.size} distinct organisms to migrate" }

            // Migrate originalData - one query per organism
            organisms.forEach { organism ->
                val dictId = compressionDictService
                    .getDictForUnalignedSequence(Organism(organism))
                    ?.id

                if (dictId != null) {
                    val updateSql = """
                        UPDATE sequence_entries
                        SET original_data = jsonb_set(
                            original_data,
                            '{unalignedNucleotideSequences}',
                            (
                                SELECT jsonb_object_agg(
                                    key,
                                    CASE 
                                        WHEN value IS NULL THEN NULL::jsonb
                                        WHEN value->>'compressionDictId' IS NOT NULL THEN value
                                        ELSE jsonb_set(value, '{compressionDictId}', to_jsonb($dictId))
                                    END
                                )
                                FROM jsonb_each(original_data->'unalignedNucleotideSequences')
                            )
                        )
                        WHERE organism = '$organism'
                        AND original_data IS NOT NULL
                        AND original_data->'unalignedNucleotideSequences' IS NOT NULL
                    """.trimIndent()

                    val rowsUpdated = exec(updateSql) ?: 0
                    log.info { "Migrated $rowsUpdated sequence entries (originalData) for organism: $organism" }
                } else {
                    log.warn { "No compression dict found for organism: $organism (unaligned)" }
                }
            }

            // Get all distinct organisms from preprocessed data
            val preprocessedOrganisms = mutableSetOf<String>()
            exec("""
                SELECT DISTINCT se.organism 
                FROM sequence_entries_preprocessed_data sepd
                INNER JOIN sequence_entries se 
                    ON sepd.accession = se.accession 
                    AND sepd.version = se.version
                WHERE sepd.processed_data IS NOT NULL
            """.trimIndent()) { rs ->
                while (rs.next()) {
                    preprocessedOrganisms.add(rs.getString(1))
                }
            }

            log.info { "Found ${preprocessedOrganisms.size} distinct organisms in preprocessed data" }

            // Get all distinct segment/gene names across all sequence types
            val segmentsGenes = mutableSetOf<String>()
            exec("""
                SELECT DISTINCT keys.key
                FROM sequence_entries_preprocessed_data,
                LATERAL (
                    SELECT jsonb_object_keys(processed_data->'unalignedNucleotideSequences') AS key
                    WHERE processed_data->'unalignedNucleotideSequences' IS NOT NULL
                    UNION
                    SELECT jsonb_object_keys(processed_data->'alignedNucleotideSequences') AS key
                    WHERE processed_data->'alignedNucleotideSequences' IS NOT NULL
                    UNION
                    SELECT jsonb_object_keys(processed_data->'alignedAminoAcidSequences') AS key
                    WHERE processed_data->'alignedAminoAcidSequences' IS NOT NULL
                ) AS keys
                WHERE processed_data IS NOT NULL
            """.trimIndent()) { rs ->
                while (rs.next()) {
                    segmentsGenes.add(rs.getString(1))
                }
            }

            log.info { "Found ${segmentsGenes.size} distinct segments/genes" }

            // Migrate processedData - one query per organism and segment/gene
            var totalRowsUpdated = 0
            preprocessedOrganisms.forEach { organism ->
                segmentsGenes.forEach { segmentOrGene ->
                    val dictId = compressionDictService
                        .getDictForSegmentOrGene(Organism(organism), segmentOrGene)
                        ?.id

                    if (dictId != null) {
                        // Update all three sequence type fields for this organism+segment/gene
                        val updateSql = """
                            WITH sequence_entry_ids AS (
                                SELECT se.accession, se.version
                                FROM sequence_entries se
                                WHERE se.organism = '$organism'
                            )
                            UPDATE sequence_entries_preprocessed_data sepd
                            SET processed_data = (
                                SELECT jsonb_set(
                                    jsonb_set(
                                        jsonb_set(
                                            sepd.processed_data,
                                            '{unalignedNucleotideSequences,$segmentOrGene}',
                                            CASE
                                                WHEN sepd.processed_data->'unalignedNucleotideSequences'->'$segmentOrGene' IS NULL 
                                                    THEN NULL::jsonb
                                                WHEN sepd.processed_data->'unalignedNucleotideSequences'->'$segmentOrGene'->>'compressionDictId' IS NOT NULL 
                                                    THEN sepd.processed_data->'unalignedNucleotideSequences'->'$segmentOrGene'
                                                ELSE jsonb_set(
                                                    sepd.processed_data->'unalignedNucleotideSequences'->'$segmentOrGene',
                                                    '{compressionDictId}',
                                                    to_jsonb($dictId)
                                                )
                                            END
                                        ),
                                        '{alignedNucleotideSequences,$segmentOrGene}',
                                        CASE
                                            WHEN sepd.processed_data->'alignedNucleotideSequences'->'$segmentOrGene' IS NULL 
                                                THEN NULL::jsonb
                                            WHEN sepd.processed_data->'alignedNucleotideSequences'->'$segmentOrGene'->>'compressionDictId' IS NOT NULL 
                                                THEN sepd.processed_data->'alignedNucleotideSequences'->'$segmentOrGene'
                                            ELSE jsonb_set(
                                                sepd.processed_data->'alignedNucleotideSequences'->'$segmentOrGene',
                                                '{compressionDictId}',
                                                to_jsonb($dictId)
                                            )
                                        END
                                    ),
                                    '{alignedAminoAcidSequences,$segmentOrGene}',
                                    CASE
                                        WHEN sepd.processed_data->'alignedAminoAcidSequences'->'$segmentOrGene' IS NULL 
                                            THEN NULL::jsonb
                                        WHEN sepd.processed_data->'alignedAminoAcidSequences'->'$segmentOrGene'->>'compressionDictId' IS NOT NULL 
                                            THEN sepd.processed_data->'alignedAminoAcidSequences'->'$segmentOrGene'
                                        ELSE jsonb_set(
                                            sepd.processed_data->'alignedAminoAcidSequences'->'$segmentOrGene',
                                            '{compressionDictId}',
                                            to_jsonb($dictId)
                                        )
                                    END
                                )
                            )
                            FROM sequence_entry_ids sei
                            WHERE sepd.accession = sei.accession
                            AND sepd.version = sei.version
                            AND sepd.processed_data IS NOT NULL
                            AND (
                                sepd.processed_data->'unalignedNucleotideSequences' ? '$segmentOrGene'
                                OR sepd.processed_data->'alignedNucleotideSequences' ? '$segmentOrGene'
                                OR sepd.processed_data->'alignedAminoAcidSequences' ? '$segmentOrGene'
                            )
                        """.trimIndent()

                        val rowsUpdated = exec(updateSql) ?: 0
                        totalRowsUpdated += rowsUpdated
                        if (rowsUpdated > 0) {
                            log.info { 
                                "Migrated $rowsUpdated sequence entries (processedData) " +
                                "for organism: $organism, segment/gene: $segmentOrGene" 
                            }
                        }
                    }
                }
            }

            log.info { "Migrated $totalRowsUpdated total sequence entries (processedData) - done" }
        }

        log.info { "Finished migration" }
    }
}
