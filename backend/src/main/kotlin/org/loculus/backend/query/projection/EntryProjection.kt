package org.loculus.backend.query.projection

import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.model.ReleasedDataWithCompressedSequences
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceSchema
import org.loculus.backend.query.store.SequenceKind
import org.loculus.backend.service.submission.CompressedSequence
import java.util.Base64

/** One query_sequences row (without organism/id). [data] is the raw zstd frame as stored by the backend. */
class ProjectedSequence(
    val kind: SequenceKind,
    val sequenceIndex: Int,
    val compressionDictId: Int?,
    val data: ByteArray,
)

/** Everything the projection stores for one released accessionVersion (id is assigned by the writer). */
class ProjectedEntry(
    val accession: String,
    val version: Long,
    val accessionVersion: String,
    val metadataJson: String,
    val presentSequences: IntArray,
    val mutations: IntArray,
    val missing: IntArray,
    val insertions: List<String>,
    val sequences: List<ProjectedSequence>,
)

/**
 * Computes the projection rows of released entries of one organism. Thread-safe (can be used from parallel workers).
 */
class EntryProjector(
    private val schema: QuerySchema,
    private val decompressor: SequenceDecompressor,
    private val objectMapper: ObjectMapper,
) {
    private val normalizer = LapisMetadataNormalizer(schema.metadata)

    fun project(entry: ReleasedDataWithCompressedSequences): ProjectedEntry {
        val metadataJson = objectMapper.writeValueAsString(normalizer.normalize(entry.metadata))
        val present = IntList(schema.nucleotideSequences.size + schema.genes.size)
        val mutations = IntList(256)
        val missing = IntList(64)
        val insertions = ArrayList<String>()
        val sequences = ArrayList<ProjectedSequence>()
        val data = entry.sequences

        for (segment in schema.nucleotideSequences) {
            data.unalignedNucleotideSequences[segment.name]?.let {
                sequences.add(stored(SequenceKind.UNALIGNED_NUCLEOTIDE, segment, it))
            }
            data.alignedNucleotideSequences[segment.name]?.let {
                present.add(segment.index)
                sequences.add(analyzeStored(SequenceKind.ALIGNED_NUCLEOTIDE, segment, it, mutations, missing))
            }
            data.nucleotideInsertions[segment.name]?.forEach {
                insertions.add(SequenceAnalysis.formatInsertion(segment.index, it))
            }
        }
        for (gene in schema.genes) {
            data.alignedAminoAcidSequences[gene.name]?.let {
                present.add(gene.index)
                sequences.add(analyzeStored(SequenceKind.ALIGNED_AMINO_ACID, gene, it, mutations, missing))
            }
            data.aminoAcidInsertions[gene.name]?.forEach {
                insertions.add(SequenceAnalysis.formatInsertion(gene.index, it))
            }
        }

        return ProjectedEntry(
            accession = entry.accession,
            version = entry.version,
            accessionVersion = "${entry.accession}.${entry.version}",
            metadataJson = metadataJson,
            presentSequences = present.toIntArray(),
            mutations = mutations.toIntArray(),
            missing = missing.toIntArray(),
            insertions = insertions,
            sequences = sequences,
        )
    }

    private fun stored(kind: SequenceKind, schema: SequenceSchema, compressed: CompressedSequence) = ProjectedSequence(
        kind,
        schema.index,
        compressed.compressionDictId,
        Base64.getDecoder().decode(compressed.compressedSequence),
    )

    private fun analyzeStored(
        kind: SequenceKind,
        schema: SequenceSchema,
        compressed: CompressedSequence,
        mutations: IntList,
        missing: IntList,
    ): ProjectedSequence {
        val sequence = stored(kind, schema, compressed)
        decompressor.decompress(sequence.data, sequence.compressionDictId) { buffer, length ->
            SequenceAnalysis.analyzeAligned(schema, buffer, length, mutations, missing)
        }
        return sequence
    }
}
