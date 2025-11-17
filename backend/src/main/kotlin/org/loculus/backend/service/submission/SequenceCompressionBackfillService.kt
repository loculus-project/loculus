package org.loculus.backend.service.submission

import mu.KotlinLogging
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.utils.DateProvider
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import java.util.concurrent.TimeUnit

private val log = KotlinLogging.logger {}

@Component
class SequenceCompressionMigration(private val migrationService: SequenceCompressionMigrationService) {
    @Scheduled(fixedDelay = 1, timeUnit = TimeUnit.DAYS)
    fun startAfterReady() {
        migrationService.migrateBatched()
    }
}

/**
 * Backfills compressionDictId into JSONB blobs in sequence_entries.original_data
 * and sequence_entries_preprocessed_data.processed_data.
 *
 */
@Service
class SequenceCompressionMigrationService(
    private val compressionDictService: CompressionDictService,
    private val dateProvider: DateProvider,
) {

    fun migrateBatched(batchSize: Int = 2_000, logEvery: Int = 1_000) {
        log.info { "Backfill: START" }
        val totalOriginal = backfillOriginalData(batchSize, logEvery)
        val totalProcessed = backfillProcessedData(batchSize, logEvery)
        log.info { "Backfill: DONE (originalData=$totalOriginal, processedData=$totalProcessed)" }
    }

    // Sequences without a compression DictId are compressed on a segment level (even original data)
    private fun migrateSequences(unmigratedSequences: Map<String, CompressedSequence?>, organism: Organism) =
        unmigratedSequences.mapValues { (key, value) ->
            when {
                value == null -> null
                value.compressionDictId != null -> value
                else -> CompressedSequence(
                    compressedSequence = value.compressedSequence,
                    compressionDictId = compressionDictService.getDictForSegmentOrGene(organism, key)?.id,
                )
            }
        }

    fun markChecked(accession: String, version: Long) {
        val se = SequenceEntriesTable
        se.update(
            where = {
                (se.accessionColumn eq accession) and
                    (se.versionColumn eq version)
            },
        ) {
            it[se.compressionMigrationCheckedAtColumn] = dateProvider.getCurrentDateTime()
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
            val page = se
                .selectAll()
                .apply {
                    andWhere { se.compressionMigrationCheckedAtColumn.isNull() }
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
                .orderBy(se.accessionColumn to SortOrder.ASC, se.versionColumn to SortOrder.DESC)
                .limit(batchSize)
                .toList()

            if (page.isEmpty()) break

            page.forEach { row ->
                val accession = row[se.accessionColumn]
                val version = row[se.versionColumn]
                val organism = Organism(row[se.organismColumn])

                val originalData = row[se.originalDataColumn] ?: run {
                    markChecked(accession, version)
                    return@forEach
                }

                val migrated = OriginalData(
                    metadata = originalData.metadata,
                    files = originalData.files,
                    unalignedNucleotideSequences = migrateSequences(
                        originalData.unalignedNucleotideSequences,
                        organism,
                    ),
                )
                if (migrated == originalData) {
                    markChecked(accession, version)
                    return@forEach
                }

                se.update(
                    where = {
                        (se.accessionColumn eq accession) and
                            (se.versionColumn eq version)
                    },
                ) {
                    it[se.originalDataColumn] = migrated
                    it[se.compressionMigrationCheckedAtColumn] = dateProvider.getCurrentDateTime()
                }

                processed++
                if (processed % logEvery == 0L) {
                    log.info { "Migrated $processed sequence entries (originalData)" }
                }
            }

            val last = page.last()
            lastAcc = last[se.accessionColumn]
            lastVer = last[se.versionColumn]
        }

        log.info { "Migrated $processed sequence entries (originalData) - done" }
        return processed
    }

    private fun markProcessedChecked(accession: String, version: Long, pipelineVersion: Long) {
        val sepd = SequenceEntriesPreprocessedDataTable
        sepd.update(
            where = {
                (sepd.accessionColumn eq accession) and
                    (sepd.versionColumn eq version) and
                    (sepd.pipelineVersionColumn eq pipelineVersion)
            },
        ) {
            it[sepd.compressionMigrationCheckedAtColumn] = dateProvider.getCurrentDateTime()
        }
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
            val page = sepd
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
                    andWhere { se.compressionMigrationCheckedAtColumn.isNull() }
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
                .orderBy(
                    sepd.accessionColumn to SortOrder.ASC,
                    sepd.versionColumn to SortOrder.ASC,
                    sepd.pipelineVersionColumn to SortOrder.ASC,
                )
                .limit(batchSize)
                .toList()

            if (page.isEmpty()) break

            // Update this page within a short transaction
            page.forEach { row ->
                val accession = row[sepd.accessionColumn]
                val version = row[sepd.versionColumn]
                val pipelineVersion = row[sepd.pipelineVersionColumn]
                val organism = Organism(row[se.organismColumn])
                val processedData = row[sepd.processedDataColumn] ?: run {
                    markProcessedChecked(accession, version, pipelineVersion)
                    return@forEach
                }

                val migrated = ProcessedData(
                    metadata = processedData.metadata,
                    files = processedData.files,
                    unalignedNucleotideSequences = migrateSequences(
                        processedData.unalignedNucleotideSequences,
                        organism,
                    ),
                    alignedNucleotideSequences = migrateSequences(
                        processedData.alignedNucleotideSequences,
                        organism,
                    ),
                    alignedAminoAcidSequences = migrateSequences(
                        processedData.alignedAminoAcidSequences,
                        organism,
                    ),
                    nucleotideInsertions = processedData.nucleotideInsertions,
                    aminoAcidInsertions = processedData.aminoAcidInsertions,
                )

                if (migrated == processedData) {
                    markProcessedChecked(accession, version, pipelineVersion)
                    return@forEach
                }

                sepd.update(
                    where = {
                        (sepd.accessionColumn eq accession) and
                            (sepd.versionColumn eq version) and
                            (sepd.pipelineVersionColumn eq pipelineVersion)
                    },
                ) {
                    it[sepd.processedDataColumn] = migrated
                    it[se.compressionMigrationCheckedAtColumn] = dateProvider.getCurrentDateTime()
                }

                processed++
                if (processed % logEvery == 0L) {
                    log.info { "Migrated $processed sequence entries (processedData)" }
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
