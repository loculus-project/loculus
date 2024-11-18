package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.node.NullNode
import com.github.luben.zstd.Zstd
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.util.Base64

data class CompressedSequence(val compressedSequence: String)

enum class CompressionAlgorithm(val extension: String) {
    NONE(""),
    ZSTD(".zst"),
    XZ(".xz"),
    GZIP(".gz"),
    ZIP(".zip"),
    BZIP2(".bz2"),
    LZMA(".lzma"),
}

@Service
class CompressionService(private val backendConfig: BackendConfig) {

    fun compressNucleotideSequence(
        uncompressedSequence: GeneticSequence,
        segmentName: String,
        organism: Organism,
    ): CompressedSequence = compress(
        uncompressedSequence,
        getDictionaryForNucleotideSequenceSegment(segmentName, organism),
    )

    private fun decompressNucleotideSequence(
        compressedSequence: CompressedSequence,
        segmentName: String,
        organism: Organism,
    ): GeneticSequence = decompress(
        compressedSequence,
        getDictionaryForNucleotideSequenceSegment(segmentName, organism),
    )

    private fun compressAminoAcidSequence(
        uncompressedSequence: String,
        gene: String,
        organism: Organism,
    ): CompressedSequence = compress(
        uncompressedSequence,
        getDictionaryForAminoAcidSequence(gene, organism),
    )

    private fun decompressAminoAcidSequence(
        compressedSequence: CompressedSequence,
        gene: String,
        organism: Organism,
    ): GeneticSequence = decompress(
        compressedSequence,
        getDictionaryForAminoAcidSequence(gene, organism),
    )

    fun decompressSequencesInOriginalData(originalData: OriginalData<CompressedSequence>, organism: Organism) =
        OriginalData(
            originalData.metadata,
            originalData
                .unalignedNucleotideSequences.mapValues {
                    when (val compressedSequence = it.value) {
                        null -> null
                        else -> decompressNucleotideSequence(compressedSequence, it.key, organism)
                    }
                },
        )

    fun compressSequencesInOriginalData(originalData: OriginalData<GeneticSequence>, organism: Organism) = OriginalData(
        originalData.metadata,
        originalData
            .unalignedNucleotideSequences.mapValues { (segmentName, sequenceData) ->
                when (sequenceData) {
                    null -> null
                    else -> compressNucleotideSequence(sequenceData, segmentName, organism)
                }
            },
    )

    fun decompressProcessedData(processedData: ProcessedData<CompressedSequence>, organism: Organism) = ProcessedData(
            backendConfig
                .getInstanceConfig(organism)
                .schema
                .metadata
                .map { it.name }
                .associateWith { fieldName ->
                    processedData.metadata[fieldName] ?: NullNode.instance
                },
            processedData
                .unalignedNucleotideSequences.mapValues { (segmentName, sequenceData) ->
                    when (sequenceData) {
                        null -> null
                        else -> decompressNucleotideSequence(sequenceData, segmentName, organism)
                    }
                },
            processedData.alignedNucleotideSequences.mapValues { (segmentName, sequenceData) ->
                when (sequenceData) {
                    null -> null
                    else -> decompressNucleotideSequence(sequenceData, segmentName, organism)
                }
            },
            processedData.nucleotideInsertions,
            processedData.alignedAminoAcidSequences.mapValues { (gene, sequenceData) ->
                when (sequenceData) {
                    null -> null
                    else -> decompressAminoAcidSequence(sequenceData, gene, organism)
                }
            },
            processedData.aminoAcidInsertions,
        )

    fun compressProcessedData(processedData: ProcessedData<String>, organism: Organism) = ProcessedData(
        processedData.metadata.filterNot { (_, value) -> value.isNull },
        processedData
            .unalignedNucleotideSequences.mapValues { (segmentName, sequenceData) ->
                when (sequenceData) {
                    null -> null
                    else -> compressNucleotideSequence(sequenceData, segmentName, organism)
                }
            },
        processedData.alignedNucleotideSequences.mapValues { (segmentName, sequenceData) ->
            when (sequenceData) {
                null -> null
                else -> compressNucleotideSequence(sequenceData, segmentName, organism)
            }
        },
        processedData.nucleotideInsertions,
        processedData.alignedAminoAcidSequences.mapValues { (gene, sequenceData) ->
            when (sequenceData) {
                null -> null
                else -> compressAminoAcidSequence(sequenceData, gene, organism)
            }
        },
        processedData.aminoAcidInsertions,
    )

    private fun compress(sequence: GeneticSequence, dictionary: ByteArray?): CompressedSequence {
        val input = sequence.toByteArray(StandardCharsets.UTF_8)
        val compressBound = Zstd.compressBound(input.size.toLong()).toInt()
        val outputBuffer = ByteArray(compressBound)

        val compressionReturnCode: Long = if (dictionary == null) {
            Zstd.compress(outputBuffer, input, 3)
        } else {
            Zstd.compress(outputBuffer, input, dictionary, 3)
        }

        if (Zstd.isError(compressionReturnCode)) {
            throw RuntimeException("Zstd compression failed: error code $compressionReturnCode")
        }

        return CompressedSequence(
            Base64.getEncoder().encodeToString(outputBuffer.copyOfRange(0, compressionReturnCode.toInt())),
        )
    }

    private fun decompress(compressedSequence: CompressedSequence, dictionary: ByteArray?): String {
        val compressed = Base64.getDecoder().decode(compressedSequence.compressedSequence)
        val decompressedSize = Zstd.getFrameContentSize(compressed)
        if (Zstd.isError(decompressedSize)) {
            throw RuntimeException("reading Zstd decompressed size failed: error code $decompressedSize")
        }
        val decompressedBuffer = ByteArray(decompressedSize.toInt())
        val decompressionReturnCode: Long = if (dictionary == null) {
            Zstd.decompress(decompressedBuffer, compressed)
        } else {
            Zstd.decompress(decompressedBuffer, compressed, dictionary)
        }
        if (Zstd.isError(decompressionReturnCode)) {
            throw RuntimeException("Zstd decompression failed: error code $decompressionReturnCode")
        }
        return String(decompressedBuffer, 0, decompressionReturnCode.toInt(), StandardCharsets.UTF_8)
    }

    private fun getDictionaryForNucleotideSequenceSegment(segmentName: String, organism: Organism): ByteArray? =
        backendConfig
            .getInstanceConfig(organism)
            .referenceGenomes
            .getNucleotideSegmentReference(
                segmentName,
            )
            ?.toByteArray()

    private fun getDictionaryForAminoAcidSequence(geneName: String, organism: Organism): ByteArray? = backendConfig
        .getInstanceConfig(organism)
        .referenceGenomes
        .getAminoAcidGeneReference(
            geneName,
        )
        ?.toByteArray()
}
