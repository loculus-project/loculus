package org.loculus.backend.utils

import org.loculus.backend.api.UnprocessedDataDownloadEntry
import org.loculus.backend.model.ACCESSION_HEADER
import org.loculus.backend.model.FASTA_IDS_HEADER
import org.loculus.backend.model.FASTA_IDS_SEPARATOR
import org.loculus.backend.model.FastaId
import org.loculus.backend.model.METADATA_ID_HEADER
import kotlin.collections.component1
import kotlin.collections.component2
import kotlin.collections.iterator
import kotlin.collections.orEmpty

/**
 * Map from original FastaId to unique FastaId for each segment in an entry.
 */
data class UniqueFastaIdsForEntry(val uniqueFastaIdByOriginalFastaId: Map<FastaId, FastaId>) {
    fun joinedUniqueFastaIds(separator: String): String = uniqueFastaIdByOriginalFastaId.values.joinToString(separator)

    fun getUniqueFastaId(originalFastaId: FastaId): FastaId = uniqueFastaIdByOriginalFastaId.getValue(originalFastaId)
}

object GetOriginalDataHelpers {

    fun uniqueFastaIdsByEntry(
        data: List<UnprocessedDataDownloadEntry>,
        isMultiSegmented: Boolean,
    ): List<UniqueFastaIdsForEntry> {
        if (!isMultiSegmented) {
            return data.map { UniqueFastaIdsForEntry(emptyMap()) }
        }

        val originalFastaIds = data.flatMapIndexed { entryIndex, entry ->
            entry.unprocessedData.unalignedNucleotideSequences.keys.map { entryIndex to it }
        }
        val fastaIdsByEntryIndex = originalFastaIds
            .zip(makeUniqueIds(originalFastaIds.map { it.second }))
            .groupBy({ it.first.first }, { it.first.second to it.second })
            .mapValues { (_, ids) -> ids.toMap() }

        return data.indices.map { UniqueFastaIdsForEntry(fastaIdsByEntryIndex[it].orEmpty()) }
    }

    fun writeMetadataTsv(
        data: List<UnprocessedDataDownloadEntry>,
        metadataIds: List<String>,
        fastaIdsByEntry: List<UniqueFastaIdsForEntry>,
        outputStream: java.io.OutputStream,
        isMultiSegmented: Boolean,
    ) {
        val metadataKeys = data.flatMapTo(mutableSetOf()) { it.unprocessedData.metadata.keys }.sorted()
        val headers = if (isMultiSegmented) {
            listOf(METADATA_ID_HEADER, ACCESSION_HEADER, FASTA_IDS_HEADER) + metadataKeys
        } else {
            listOf(METADATA_ID_HEADER, ACCESSION_HEADER) + metadataKeys
        }

        TsvWriter(outputStream, headers).use { writer ->
            for ((index, entry) in data.withIndex()) {
                val metadataValues = metadataKeys.map { entry.unprocessedData.metadata[it] ?: "" }
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
        data: List<UnprocessedDataDownloadEntry>,
        metadataIds: List<String>,
        fastaIdsByEntry: List<UniqueFastaIdsForEntry>,
        outputStream: java.io.OutputStream,
        isMultiSegmented: Boolean,
    ) {
        FastaWriter(outputStream).use { writer ->
            for ((index, entry) in data.withIndex()) {
                for ((originalFastaId, sequence) in entry.unprocessedData.unalignedNucleotideSequences) {
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
}
