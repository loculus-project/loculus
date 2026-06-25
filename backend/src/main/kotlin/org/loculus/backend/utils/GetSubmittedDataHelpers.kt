package org.loculus.backend.utils

import org.loculus.backend.api.SubmittedDataDownloadEntry
import org.loculus.backend.model.ACCESSION_HEADER
import org.loculus.backend.model.FASTA_IDS_HEADER
import org.loculus.backend.model.FASTA_IDS_SEPARATOR
import org.loculus.backend.model.FastaId
import org.loculus.backend.model.METADATA_ID_HEADER
import kotlin.collections.component1
import kotlin.collections.component2
import kotlin.collections.iterator
import kotlin.collections.orEmpty

const val FILE_CATEGORY_HEADER = "category"
const val FILE_ID_HEADER = "fileId"
const val FILE_NAME_HEADER = "fileName"

/**
 * Map from original FastaId to unique FastaId for each segment in an entry.
 */
data class UniqueFastaIdsForEntry(val uniqueFastaIdByOriginalFastaId: Map<FastaId, FastaId>) {
    fun joinedUniqueFastaIds(separator: String): String = uniqueFastaIdByOriginalFastaId.values.joinToString(separator)

    fun getUniqueFastaId(originalFastaId: FastaId): FastaId = uniqueFastaIdByOriginalFastaId.getValue(originalFastaId)
}

object GetSubmittedDataHelpers {

    fun uniqueFastaIdsByEntry(
        data: List<SubmittedDataDownloadEntry>,
        isMultiSegmented: Boolean,
    ): List<UniqueFastaIdsForEntry> {
        if (!isMultiSegmented) {
            return data.map { UniqueFastaIdsForEntry(emptyMap()) }
        }

        val originalFastaIds = data.flatMapIndexed { entryIndex, entry ->
            entry.submittedData.unalignedNucleotideSequences.keys.map { entryIndex to it }
        }
        val fastaIdsByEntryIndex = originalFastaIds
            .zip(makeUniqueIds(originalFastaIds.map { it.second }))
            .groupBy({ it.first.first }, { it.first.second to it.second })
            .mapValues { (_, ids) -> ids.toMap() }

        return data.indices.map { UniqueFastaIdsForEntry(fastaIdsByEntryIndex[it].orEmpty()) }
    }

    fun writeMetadataTsv(
        data: List<SubmittedDataDownloadEntry>,
        metadataIds: List<String>,
        fastaIdsByEntry: List<UniqueFastaIdsForEntry>,
        outputStream: java.io.OutputStream,
        isMultiSegmented: Boolean,
    ) {
        val metadataKeys = data.flatMapTo(mutableSetOf()) { it.submittedData.metadata.keys }.sorted()
        val headers = if (isMultiSegmented) {
            listOf(METADATA_ID_HEADER, ACCESSION_HEADER, FASTA_IDS_HEADER) + metadataKeys
        } else {
            listOf(METADATA_ID_HEADER, ACCESSION_HEADER) + metadataKeys
        }

        TsvWriter(outputStream, headers).use { writer ->
            for ((index, entry) in data.withIndex()) {
                val metadataValues = metadataKeys.map { entry.submittedData.metadata[it] ?: "" }
                val row = if (isMultiSegmented) {
                    val fastaIds = fastaIdsByEntry[index].joinedUniqueFastaIds(FASTA_IDS_SEPARATOR)
                    listOf(metadataIds[index], entry.accession, fastaIds) + metadataValues
                } else {
                    listOf(metadataIds[index], entry.accession) + metadataValues
                }
                writer.writeRow(row)
            }
        }
    }

    fun writeSequencesFasta(
        data: List<SubmittedDataDownloadEntry>,
        metadataIds: List<String>,
        fastaIdsByEntry: List<UniqueFastaIdsForEntry>,
        outputStream: java.io.OutputStream,
        isMultiSegmented: Boolean,
    ) {
        FastaWriter(outputStream).use { writer ->
            for ((index, entry) in data.withIndex()) {
                for ((originalFastaId, sequence) in entry.submittedData.unalignedNucleotideSequences) {
                    if (sequence != null) {
                        val header = if (isMultiSegmented) {
                            fastaIdsByEntry[index].getUniqueFastaId(originalFastaId)
                        } else {
                            metadataIds[index]
                        }
                        writer.write(FastaEntry(header, sequence))
                    }
                }
            }
        }
    }

    /**
     * Writes one row per attached file. The `id` column reuses [metadataIds] so it joins the
     * metadata TSV on re-upload, even when submission ids collide within a download.
     */
    fun writeExistingFilesTsv(
        data: List<SubmittedDataDownloadEntry>,
        metadataIds: List<String>,
        outputStream: java.io.OutputStream,
    ) {
        val headers = listOf(METADATA_ID_HEADER, FILE_CATEGORY_HEADER, FILE_ID_HEADER, FILE_NAME_HEADER)
        TsvWriter(outputStream, headers).use { writer ->
            for ((index, entry) in data.withIndex()) {
                val filesByCategory = entry.submittedData.files ?: continue
                for ((category, files) in filesByCategory) {
                    for (file in files) {
                        writer.writeRow(listOf(metadataIds[index], category, file.fileId.toString(), file.name))
                    }
                }
            }
        }
    }
}
