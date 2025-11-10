package org.loculus.backend.service.maintenance

import mu.KotlinLogging
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.service.submission.CompressedSequence
import org.loculus.backend.service.submission.CompressionDictService
import org.loculus.backend.service.submission.SequenceEntriesPreprocessedDataTable
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service

private val log = KotlinLogging.logger {}

@Component
class SequenceCompressionBackfillStarter(private val backfill: SequenceCompressionBackfillService) {
    @Scheduled(fixedDelay = 1, timeUnit = java.util.concurrent.TimeUnit.DAYS)
    fun startAfterReady() {
        backfill.run()
    }
}

/**
 * Backfills compressionDictId into JSONB blobs in sequence_entries.original_data
 * and sequence_entries_preprocessed_data.processed_data.
 *
 */
@Service
class SequenceCompressionBackfillService(private val compressionDictService: CompressionDictService) {

    fun run(batchSize: Int = 2_000, logEvery: Int = 1_000) {
        log.info { "Backfill: START" }
        val totalOriginal = backfillOriginalData(batchSize, logEvery)
        val totalProcessed = backfillProcessedData(batchSize, logEvery)
        log.info { "Backfill: DONE (originalData=$totalOriginal, processedData=$totalProcessed)" }
    }

    // Sequences without a compression DictId are compressed on a segment level (even original data)
    private fun addCompressionDict(originalData: Map<String, CompressedSequence?>, organism: String) =
        originalData.mapValues { (key, value) ->
            when {
                value == null -> null
                value.compressionDictId != null -> value
                else -> CompressedSequence(
                    compressedSequence = value.compressedSequence,
                    compressionDictId = compressionDictService.getDictForSegmentOrGene(Organism(organism), key)?.id,
                )
            }
        }

    // -------------------------
    // original_data paginator
    // -------------------------
    private fun backfillOriginalData(batchSize: Int, logEvery: Int): Long {
        var processed = 0L

        var lastAcc: String? = null
        var lastVer: Long? = null

        val se = SequenceEntriesTable

        while (true) {
            // Read a page using keyset pagination
            val page = transaction {
                se
                    .selectAll()
                    .apply {
                        if (lastAcc != null && lastVer != null) {
                            andWhere {
                                (se.accessionColumn greater lastAcc!!) or
                                    (
                                        (se.accessionColumn eq lastAcc!!) and
                                            (se.versionColumn greater lastVer!!)
                                        )
                            }
                        }
                    }
                    .orderBy(se.accessionColumn to SortOrder.ASC)
                    .orderBy(se.versionColumn to SortOrder.ASC)
                    .limit(batchSize)
                    .toList()
            }

            if (page.isEmpty()) break

            // Update this page in a short transaction
            transaction {
                var i = 0
                page.forEach { row ->
                    val accession = row[se.accessionColumn]
                    val version = row[se.versionColumn]
                    val organism = row[se.organismColumn]
                    val originalData = row[se.originalDataColumn] ?: return@forEach

                    val migrated = OriginalData(
                        metadata = originalData.metadata,
                        files = originalData.files,
                        unalignedNucleotideSequences = addCompressionDict(
                            originalData.unalignedNucleotideSequences,
                            organism,
                        ),
                    )
                    if (migrated != originalData) {
                        se.update(
                            where = {
                                (se.accessionColumn eq accession) and
                                    (se.versionColumn eq version)
                            },
                        ) {
                            it[se.originalDataColumn] = migrated
                        }

                        processed++
                    }
                    if (++i % logEvery == 0) {
                        log.info { "Migrated $processed sequence entries (originalData)" }
                    }
                }

                val last = page.last()
                lastAcc = last[se.accessionColumn]
                lastVer = last[se.versionColumn]
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

        val se = SequenceEntriesTable
        val sepd = SequenceEntriesPreprocessedDataTable

        while (true) {
            // Read a page with keyset pagination over (accession, version, pipeline_version)
            val page = transaction {
                sepd
                    .join(
                        se,
                        joinType = JoinType.INNER,
                        additionalConstraint = {
                            (
                                sepd.accessionColumn eq
                                    se.accessionColumn
                                ) and
                                (
                                    sepd.versionColumn eq
                                        se.versionColumn
                                    )
                        },
                    )
                    .selectAll()
                    .apply {
                        if (lastAcc != null && lastVer != null && lastPipeVer != null) {
                            andWhere {
                                (sepd.accessionColumn greater lastAcc!!) or
                                    (
                                        (sepd.accessionColumn eq lastAcc!!) and
                                            (
                                                (sepd.versionColumn greater lastVer!!) or
                                                    (
                                                        (sepd.versionColumn eq lastVer!!) and
                                                            (
                                                                sepd.pipelineVersionColumn greater
                                                                    lastPipeVer!!
                                                                )
                                                        )
                                                )
                                        )
                            }
                        }
                    }
                    .orderBy(sepd.accessionColumn to SortOrder.ASC)
                    .orderBy(sepd.versionColumn to SortOrder.ASC)
                    .orderBy(sepd.pipelineVersionColumn to SortOrder.ASC)
                    .limit(batchSize)
                    .toList()
            }

            if (page.isEmpty()) break

            // Update this page within a short transaction
            transaction {
                var i = 0
                page.forEach { row ->
                    val accession = row[sepd.accessionColumn]
                    val version = row[sepd.versionColumn]
                    val pipelineVersion = row[sepd.pipelineVersionColumn]
                    val organism = row[se.organismColumn]
                    val processedData = row[sepd.processedDataColumn] ?: return@forEach

                    val migrated = ProcessedData(
                        metadata = processedData.metadata,
                        files = processedData.files,
                        unalignedNucleotideSequences = addCompressionDict(
                            processedData.unalignedNucleotideSequences,
                            organism,
                        ),
                        alignedNucleotideSequences = addCompressionDict(
                            processedData.alignedNucleotideSequences,
                            organism,
                        ),
                        alignedAminoAcidSequences = addCompressionDict(
                            processedData.alignedAminoAcidSequences,
                            organism,
                        ),
                        nucleotideInsertions = processedData.nucleotideInsertions,
                        aminoAcidInsertions = processedData.aminoAcidInsertions,
                    )
                    if (migrated != processedData) {
                        sepd.update(
                            where = {
                                (sepd.accessionColumn eq accession) and
                                    (sepd.versionColumn eq version) and
                                    (sepd.pipelineVersionColumn eq pipelineVersion)
                            },
                        ) {
                            it[sepd.processedDataColumn] = migrated
                        }

                        processed++
                    }
                    if (++i % logEvery == 0) {
                        log.info { "Migrated $processed sequence entries (processedData)" }
                    }
                }

                val last = page.last()
                lastAcc = last[sepd.accessionColumn]
                lastVer = last[sepd.versionColumn]
                lastPipeVer = last[sepd.pipelineVersionColumn]
            }
        }

        log.info { "Migrated $processed sequence entries (processedData) - done" }
        return processed
    }
}
