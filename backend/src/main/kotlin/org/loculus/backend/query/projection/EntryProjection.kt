package org.loculus.backend.query.projection

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.model.ReleasedDataWithCompressedSequences
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceSchema
import org.loculus.backend.query.store.SequenceKind
import org.loculus.backend.query.store.StoredMetadataCompressor
import org.loculus.backend.service.submission.CompressedSequence
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.Base64

/** One query_sequences row (without organism/id). [data] is the raw zstd frame as stored by the backend. */
class ProjectedSequence(
    val kind: SequenceKind,
    val sequenceIndex: Int,
    val compressionDictId: Int?,
    val data: ByteArray,
)

/**
 * Everything the projection stores for one released accessionVersion (id is assigned by the writer).
 *
 * If [sequenceDataUnchanged], the sequence-derived data was not computed because [sourceHash] equals the hash stored
 * for the entry: the existing query_mutation_data and query_sequences rows are still valid and must be kept
 * (the arrays and [sequences] are empty then).
 */
class ProjectedEntry(
    val accession: String,
    val version: Long,
    val accessionVersion: String,
    /** the LAPIS record as JSON text (UTF-8) */
    val metadataJson: ByteArray,
    /** [metadataJson] compressed with the dictionary [metadataDictionaryId] (see StoredMetadata) */
    val metadataZstd: ByteArray,
    val metadataDictionaryId: Int?,
    /** dataUseTerms is RESTRICTED: the projection goes stale when the restriction ends */
    val dataUseTermsRestricted: Boolean,
    val sourceHash: Long,
    val sequenceDataUnchanged: Boolean,
    val presentSequences: IntArray,
    val mutations: IntArray,
    val missing: IntArray,
    val insertions: List<String>,
    val sequences: List<ProjectedSequence>,
)

/**
 * The projection encoding of [schema], stored as query_engine_state.encoding_hash:
 * `<sequence encoding>/m<metadata encoding>`. The sequence part covers what the sequence-derived rows depend on
 * ([QuerySchema.encodingHash]); the metadata part covers the metadata fields, their types and
 * [EntryProjector.METADATA_FORMAT_VERSION]. A change of the metadata part alone rewrites only the metadata.
 */
fun projectionEncoding(schema: QuerySchema): String {
    val metadata = (schema.metadata.map { "${it.name}:${it.type}" } + "v${EntryProjector.METADATA_FORMAT_VERSION}")
        .joinToString("|").hashCode().toString(16)
    return "${schema.encodingHash()}$METADATA_ENCODING_SEPARATOR$metadata"
}

/** the sequence part of a stored projection encoding (encodings written before the metadata part are all sequence) */
fun sequenceEncoding(projectionEncoding: String): String =
    projectionEncoding.substringBefore(METADATA_ENCODING_SEPARATOR)

private const val METADATA_ENCODING_SEPARATOR = "/m"

/**
 * Computes the projection rows of released entries of one organism. Thread-safe (can be used from parallel workers).
 */
class EntryProjector(
    private val schema: QuerySchema,
    private val decompressor: SequenceDecompressor,
    private val objectMapper: ObjectMapper,
    private val metadataCompressor: StoredMetadataCompressor,
) {
    private val normalizer = LapisMetadataNormalizer(schema.metadata)

    /** the stored JSON text of a get-released-data metadata record */
    fun metadataJson(metadata: Map<String, JsonNode>): ByteArray =
        objectMapper.writeValueAsBytes(normalizer.normalize(metadata))

    /**
     * @param storedSourceHash the source hash currently stored for this accessionVersion (null if none or not to be
     *   trusted): if it equals the hash of [entry]'s sequence data, the sequence-derived data is not recomputed.
     */
    fun project(entry: ReleasedDataWithCompressedSequences, storedSourceHash: Long? = null): ProjectedEntry {
        val metadata = normalizer.normalize(entry.metadata)
        val metadataJson = objectMapper.writeValueAsBytes(metadata)
        val metadataZstd = metadataCompressor.compress(metadataJson)
        val restricted = metadata[DATA_USE_TERMS]?.asText() == RESTRICTED
        val accessionVersion = "${entry.accession}.${entry.version}"
        val sourceHash = sourceHash(entry)
        if (storedSourceHash == sourceHash) {
            return ProjectedEntry(
                accession = entry.accession,
                version = entry.version,
                accessionVersion = accessionVersion,
                metadataJson = metadataJson,
                metadataZstd = metadataZstd,
                metadataDictionaryId = metadataCompressor.dictionaryId,
                dataUseTermsRestricted = restricted,
                sourceHash = sourceHash,
                sequenceDataUnchanged = true,
                presentSequences = IntArray(0),
                mutations = IntArray(0),
                missing = IntArray(0),
                insertions = emptyList(),
                sequences = emptyList(),
            )
        }
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
            accessionVersion = accessionVersion,
            metadataJson = metadataJson,
            metadataZstd = metadataZstd,
            metadataDictionaryId = metadataCompressor.dictionaryId,
            dataUseTermsRestricted = restricted,
            sourceHash = sourceHash,
            sequenceDataUnchanged = false,
            presentSequences = present.toIntArray(),
            mutations = mutations.toIntArray(),
            missing = missing.toIntArray(),
            insertions = insertions,
            sequences = sequences,
        )
    }

    /**
     * 64 bit hash (SHA-256 prefix) of everything the sequence-derived rows are computed from: the stored compressed
     * sequences (with dictionary ids) and insertions of the schema's segments and genes, and [PROJECTION_VERSION].
     */
    fun sourceHash(entry: ReleasedDataWithCompressedSequences): Long {
        val digest = MessageDigest.getInstance("SHA-256")
        fun add(value: String?) {
            digest.update((value ?: "\u0000").toByteArray())
            digest.update(0x1F)
        }
        add(PROJECTION_VERSION.toString())
        val data = entry.sequences
        fun addSequence(sequence: CompressedSequence?) {
            add(sequence?.compressionDictId?.toString())
            add(sequence?.compressedSequence)
        }
        for (segment in schema.nucleotideSequences) {
            add(segment.name)
            addSequence(data.unalignedNucleotideSequences[segment.name])
            addSequence(data.alignedNucleotideSequences[segment.name])
            data.nucleotideInsertions[segment.name]?.forEach { add(it.toString()) }
        }
        for (gene in schema.genes) {
            add(gene.name)
            addSequence(data.alignedAminoAcidSequences[gene.name])
            data.aminoAcidInsertions[gene.name]?.forEach { add(it.toString()) }
        }
        return ByteBuffer.wrap(digest.digest()).getLong()
    }

    companion object {
        /** bump when the computation of the sequence-derived data changes (invalidates all source hashes) */
        const val PROJECTION_VERSION = 1

        /**
         * bump when the stored form of query_entries.metadata changes: the projection encoding changes, and the
         * projector rewrites every entry's metadata (see [projectionEncoding])
         */
        const val METADATA_FORMAT_VERSION = 3

        private const val DATA_USE_TERMS = "dataUseTerms"
        private const val RESTRICTED = "RESTRICTED"
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
