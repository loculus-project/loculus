package org.loculus.backend.service.maintenance

import mu.KotlinLogging
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greater
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.service.jacksonSerializableJsonb
import org.loculus.backend.service.submission.CompressedSequence
import org.loculus.backend.service.submission.CompressionDictService
import org.loculus.backend.service.submission.SequenceEntriesPreprocessedDataTable
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.concurrent.ConcurrentHashMap
import javax.sql.DataSource

private val log = KotlinLogging.logger {}

/**
 * Backfills compressionDictId into JSONB blobs in sequence_entries.original_data
 * and sequence_entries_preprocessed_data.processed_data.
 *
 */
@Service
@Transactional
class SequenceCompressionBackfillService(private val compressionDictService: CompressionDictService) {
    // Simple caches to avoid hammering CompressionDictService
    private val dictByOrganism = ConcurrentHashMap<String, Int?>()
    private val dictByOrganismAndKey = ConcurrentHashMap<Pair<String, String>, Int?>()

    fun run(batchSize: Int = 2_000, logEvery: Int = 1_000) {
        log.info { "Backfill: START" }
        val totalOriginal = backfillOriginalData(batchSize, logEvery)
        val totalProcessed = backfillProcessedData(batchSize, logEvery)
        log.info { "Backfill: DONE (originalData=$totalOriginal, processedData=$totalProcessed)" }
    }

    // -------------------------
    // original_data paginator
    // -------------------------
    private fun backfillOriginalData(batchSize: Int, logEvery: Int): Long {
        var processed = 0L

        var lastAcc: String? = null
        var lastVer: Long? = null

        while (true) {
            // Read a page using keyset pagination
            val page = transaction {
                SequenceEntriesTable
                    .selectAll()
                    .apply {
                        if (lastAcc != null && lastVer != null) {
                            andWhere {
                                (SequenceEntriesTable.accessionColumn greater lastAcc!!) or
                                    (
                                        (SequenceEntriesTable.accessionColumn eq lastAcc!!) and
                                            (SequenceEntriesTable.versionColumn greater lastVer!!)
                                        )
                            }
                        }
                    }
                    .orderBy(SequenceEntriesTable.accessionColumn to SortOrder.ASC)
                    .orderBy(SequenceEntriesTable.versionColumn to SortOrder.ASC)
                    .limit(batchSize)
                    .toList()
            }

            if (page.isEmpty()) break

            // Update this page in a short transaction
            transaction {
                var i = 0
                page.forEach { row ->
                    val accession = row[SequenceEntriesTable.accessionColumn]
                    val version = row[SequenceEntriesTable.versionColumn]
                    val organism = row[SequenceEntriesTable.organismColumn]
                    val originalData = row[SequenceEntriesTable.originalDataColumn] ?: return@forEach

                    val migrated = OriginalData(
                        metadata = originalData.metadata,
                        files = originalData.files,
                        unalignedNucleotideSequences = originalData.unalignedNucleotideSequences.mapValues { (key, value) ->
                            when {
                                value == null -> null
                                value.compressionDictId != null -> value
                                else -> CompressedSequence(
                                    compressedSequence = value.compressedSequence,
                                    compressionDictId = dictByOrganism.computeIfAbsent(organism) {
                                        compressionDictService.getDictForUnalignedSequence(Organism(organism))?.id
                                    },
                                )
                            }
                        },
                    )

                    SequenceEntriesTable.update(
                        where = {
                            (SequenceEntriesTable.accessionColumn eq accession) and
                                (SequenceEntriesTable.versionColumn eq version)
                        },
                    ) {
                        it[SequenceEntriesTable.originalDataColumn] = migrated
                    }

                    processed++
                    if (++i % logEvery == 0) {
                        log.info { "Migrated $processed sequence entries (originalData)" }
                    }
                }

                val last = page.last()
                lastAcc = last[SequenceEntriesTable.accessionColumn]
                lastVer = last[SequenceEntriesTable.versionColumn]
            }
        }

        log.info { "Migrated $processed sequence entries (originalData) - done" }
        return processed
    }

    // ------------------------------------------
    // processed_data paginator (joined table)
    // ------------------------------------------
    private fun backfillProcessedData(batchSize: Int, logEvery: Int): Long {
        var processed = 0L

        var lastAcc: String? = null
        var lastVer: Long? = null
        var lastPipeVer: Long? = null

        while (true) {
            // Read a page with keyset pagination over (accession, version, pipeline_version)
            val page = transaction {
                SequenceEntriesPreprocessedDataTable
                    .join(
                        SequenceEntriesTable,
                        joinType = JoinType.INNER,
                        additionalConstraint = {
                            (
                                SequenceEntriesPreprocessedDataTable.accessionColumn eq
                                    SequenceEntriesTable.accessionColumn
                                ) and
                                (
                                    SequenceEntriesPreprocessedDataTable.versionColumn eq
                                        SequenceEntriesTable.versionColumn
                                    )
                        },
                    )
                    .selectAll()
                    .apply {
                        if (lastAcc != null && lastVer != null && lastPipeVer != null) {
                            andWhere {
                                (SequenceEntriesPreprocessedDataTable.accessionColumn greater lastAcc!!) or
                                    (
                                        (SequenceEntriesPreprocessedDataTable.accessionColumn eq lastAcc!!) and
                                            (
                                                (SequenceEntriesPreprocessedDataTable.versionColumn greater lastVer!!) or
                                                    (
                                                        (SequenceEntriesPreprocessedDataTable.versionColumn eq lastVer!!) and
                                                            (
                                                                SequenceEntriesPreprocessedDataTable.pipelineVersionColumn greater
                                                                    lastPipeVer!!
                                                                )
                                                        )
                                                )
                                        )
                            }
                        }
                    }
                    .orderBy(SequenceEntriesPreprocessedDataTable.accessionColumn to SortOrder.ASC)
                    .orderBy(SequenceEntriesPreprocessedDataTable.versionColumn to SortOrder.ASC)
                    .orderBy(SequenceEntriesPreprocessedDataTable.pipelineVersionColumn to SortOrder.ASC)
                    .limit(batchSize)
                    .toList()
            }

            if (page.isEmpty()) break

            // Update this page within a short transaction
            transaction {
                var i = 0
                page.forEach { row ->
                    val accession = row[SequenceEntriesPreprocessedDataTable.accessionColumn]
                    val version = row[SequenceEntriesPreprocessedDataTable.versionColumn]
                    val pipelineVersion = row[SequenceEntriesPreprocessedDataTable.pipelineVersionColumn]
                    val organism = row[SequenceEntriesTable.organismColumn]
                    val processedData = row[SequenceEntriesPreprocessedDataTable.processedDataColumn] ?: return@forEach

                    val migrated = ProcessedData(
                        metadata = processedData.metadata,
                        files = processedData.files,
                        unalignedNucleotideSequences = processedData.unalignedNucleotideSequences.mapValues { (key, value) ->
                            when {
                                value == null -> null
                                value.compressionDictId != null -> value
                                else -> CompressedSequence(
                                    compressedSequence = value.compressedSequence,
                                    compressionDictId = dictByOrganismAndKey.computeIfAbsent(organism to key) {
                                        compressionDictService.getDictForSegmentOrGene(Organism(organism), key)?.id
                                    },
                                )
                            }
                        },
                        alignedNucleotideSequences = processedData.alignedNucleotideSequences.mapValues { (key, value) ->
                            when {
                                value == null -> null
                                value.compressionDictId != null -> value
                                else -> CompressedSequence(
                                    compressedSequence = value.compressedSequence,
                                    compressionDictId = dictByOrganismAndKey.computeIfAbsent(organism to key) {
                                        compressionDictService.getDictForSegmentOrGene(Organism(organism), key)?.id
                                    },
                                )
                            }
                        },
                        alignedAminoAcidSequences = processedData.alignedAminoAcidSequences.mapValues { (key, value) ->
                            when {
                                value == null -> null
                                value.compressionDictId != null -> value
                                else -> CompressedSequence(
                                    compressedSequence = value.compressedSequence,
                                    compressionDictId = dictByOrganismAndKey.computeIfAbsent(organism to key) {
                                        compressionDictService.getDictForSegmentOrGene(Organism(organism), key)?.id
                                    },
                                )
                            }
                        },
                        nucleotideInsertions = processedData.nucleotideInsertions,
                        aminoAcidInsertions = processedData.aminoAcidInsertions,
                    )

                    SequenceEntriesPreprocessedDataTable.update(
                        where = {
                            (SequenceEntriesPreprocessedDataTable.accessionColumn eq accession) and
                                (SequenceEntriesPreprocessedDataTable.versionColumn eq version) and
                                (SequenceEntriesPreprocessedDataTable.pipelineVersionColumn eq pipelineVersion)
                        },
                    ) {
                        it[SequenceEntriesPreprocessedDataTable.processedDataColumn] = migrated
                    }

                    processed++
                    if (++i % logEvery == 0) {
                        log.info { "Migrated $processed sequence entries (processedData)" }
                    }
                }

                val last = page.last()
                lastAcc = last[SequenceEntriesPreprocessedDataTable.accessionColumn]
                lastVer = last[SequenceEntriesPreprocessedDataTable.versionColumn]
                lastPipeVer = last[SequenceEntriesPreprocessedDataTable.pipelineVersionColumn]
            }
        }

        log.info { "Migrated $processed sequence entries (processedData) - done" }
        return processed
    }
}
