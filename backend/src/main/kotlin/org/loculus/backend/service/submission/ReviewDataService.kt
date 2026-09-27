package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.jetbrains.exposed.v1.core.alias
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.less
import org.jetbrains.exposed.v1.core.max
import org.jetbrains.exposed.v1.core.wrapAsExpression
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.json.extract
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.FileCategoryFilesMap
import org.loculus.backend.api.MetadataMap
import org.loculus.backend.api.NucleotideSequenceReview
import org.loculus.backend.api.Organism
import org.loculus.backend.api.RevisionReviewData
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.SequenceReviewData
import org.loculus.backend.api.Status
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service

/** Load compact data for the authorized page. */
@Service
class ReviewDataService(
    private val objectMapper: ObjectMapper,
    private val metadataPostprocessor: ProcessedMetadataPostprocessor,
    private val compressionService: CompressionService,
    private val backendConfig: BackendConfig,
) {
    fun enrich(entries: List<SequenceEntryStatus>, organism: Organism): List<SequenceEntryStatus> {
        val reviewable = entries.filter {
            !it.isRevocation && it.status in listOf(Status.PROCESSED, Status.APPROVED_FOR_RELEASE)
        }.map { AccessionVersion(it.accession, it.version) }
        if (reviewable.isEmpty()) return entries

        val revisions = reviewable.filter { it.version > 1 }
        val previousVersions = findPreviousVersions(revisions, organism)
        val ids = (reviewable + previousVersions.values).distinct()
        val table = SequenceEntriesView
        // Project only the JSON fields needed by review cards.
        val metadata = table.processedDataColumn.extract<String>("metadata")
        val files = table.processedDataColumn.extract<String>("files")
        val details = table.select(
            table.accessionColumn,
            table.versionColumn,
            metadata,
            files,
            table.errorsColumn,
            table.warningsColumn,
        ).where {
            table.organismIs(organism) and table.accessionVersionIsIn(ids) and
                (table.isRevocationColumn eq false) and
                table.statusIsOneOf(listOf(Status.PROCESSED, Status.APPROVED_FOR_RELEASE))
        }.mapNotNull { row ->
            val rawMetadata = row.getOrNull(metadata) ?: return@mapNotNull null
            AccessionVersion(row[table.accessionColumn], row[table.versionColumn]) to SequenceReviewData(
                metadata = metadataPostprocessor.filterOutExtraFieldsAndAddNulls(
                    objectMapper.readValue<MetadataMap>(rawMetadata),
                    organism,
                ),
                errors = row[table.errorsColumn],
                warnings = row[table.warningsColumn],
                files = row.getOrNull(files)?.let { objectMapper.readValue<FileCategoryFilesMap>(it) },
                revision = null,
            )
        }.toMap()

        // Compare revisions with an available baseline in one batch.
        val comparable = revisions.filter {
            it in details && previousVersions[it] in details
        }
        val comparisonIds = comparable.flatMap { listOf(it, previousVersions.getValue(it)) }
        val sequences = if (comparisonIds.isEmpty()) {
            emptyMap()
        } else {
            val unaligned = table.processedDataColumn.extract<String>("unalignedNucleotideSequences")
            table.select(table.accessionColumn, table.versionColumn, unaligned).where {
                table.organismIs(organism) and table.accessionVersionIsIn(comparisonIds)
            }.mapNotNull { row ->
                val rawSequences = row.getOrNull(unaligned) ?: return@mapNotNull null
                AccessionVersion(row[table.accessionColumn], row[table.versionColumn]) to
                    objectMapper.readValue<Map<String, CompressedSequence?>>(rawSequences)
            }.toMap()
        }
        val segmentNames = backendConfig.getInstanceConfig(organism).referenceGenome.nucleotideSequences.map { it.name }

        return entries.map { entry ->
            val id = AccessionVersion(entry.accession, entry.version)
            val data = details[id] ?: return@map entry
            val revision = if (entry.version > 1) {
                val previousId = previousVersions[id]
                val previous = sequences[previousId]
                val current = sequences[id]
                val available = previous != null && current != null
                RevisionReviewData(
                    previousVersion = previousId?.version,
                    previousMetadata = if (available) details[previousId]?.metadata else null,
                    nucleotideChanges = if (available) {
                        segmentNames.filter { previous[it] != null || current[it] != null }.associateWith { name ->
                            val before = previous[name]
                            val after = current[name]
                            compareSequences(before, after)
                        }
                    } else {
                        emptyMap()
                    },
                )
            } else {
                null
            }
            entry.copy(reviewData = data.copy(revision = revision))
        }
    }

    private fun findPreviousVersions(
        revisions: List<AccessionVersion>,
        organism: Organism,
    ): Map<AccessionVersion, AccessionVersion> {
        if (revisions.isEmpty()) return emptyMap()
        val table = SequenceEntriesView
        val previous = table.alias("review_baseline")
        val previousVersion = wrapAsExpression<Long>(
            previous.select(previous[table.versionColumn].max()).where {
                (previous[table.accessionColumn] eq table.accessionColumn) and
                    (previous[table.versionColumn] less table.versionColumn) and
                    (previous[table.organismColumn] eq organism.name) and
                    (previous[table.isRevocationColumn] eq false) and
                    (previous[table.statusColumn] eq Status.APPROVED_FOR_RELEASE.name)
            },
        )
        return table.select(table.accessionColumn, table.versionColumn, previousVersion).where {
            table.organismIs(organism) and table.accessionVersionIsIn(revisions)
        }.mapNotNull { row ->
            val version = row[previousVersion] ?: return@mapNotNull null
            val accession = row[table.accessionColumn]
            AccessionVersion(accession, row[table.versionColumn]) to AccessionVersion(accession, version)
        }.toMap()
    }

    private fun compareSequences(before: CompressedSequence?, after: CompressedSequence?): NucleotideSequenceReview {
        // Equal content and dictionary IDs imply equal sequences.
        if (before == after) {
            val length = before?.let { compressionService.getSequenceLength(it) }
            return NucleotideSequenceReview(false, length, length)
        }
        val previous = before?.let { compressionService.decompress(it) }
        val current = after?.let { compressionService.decompress(it) }
        return NucleotideSequenceReview(previous != current, previous?.length, current?.length)
    }
}
