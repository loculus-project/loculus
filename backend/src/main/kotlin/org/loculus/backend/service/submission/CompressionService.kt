package org.loculus.backend.service.submission

import com.github.luben.zstd.Zstd
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.util.Base64

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

    fun compressNucleotideSequence(uncompressedSequence: String, segmentName: String, organism: Organism): String =
        compress(
            uncompressedSequence,
            getDictionaryForNucleotideSequenceSegment(segmentName, organism),
        )

    private fun decompressNucleotideSequence(
        compressedSequence: String,
        segmentName: String,
        organism: Organism,
    ): String = decompress(
        compressedSequence,
        getDictionaryForNucleotideSequenceSegment(segmentName, organism),
    )

    private fun compressAminoAcidSequence(uncompressedSequence: String, gene: String, organism: Organism): String =
        compress(
            uncompressedSequence,
            getDictionaryForAminoAcidSequence(gene, organism),
        )

    private fun decompressAminoAcidSequence(compressedSequence: String, gene: String, organism: Organism): String =
        decompress(
            compressedSequence,
            getDictionaryForAminoAcidSequence(gene, organism),
        )

    fun decompressSequencesInOriginalData(originalData: OriginalData, organism: Organism) = OriginalData(
        originalData.metadata,
        originalData
            .unalignedNucleotideSequences.mapValues {
                decompressNucleotideSequence(
                    it.value,
                    it.key,
                    organism,
                )
            },
    )

    fun compressSequencesInOriginalData(originalData: OriginalData, organism: Organism) = OriginalData(
        originalData.metadata,
        originalData
            .unalignedNucleotideSequences.mapValues { (segmentName, sequenceData) ->
                compressNucleotideSequence(
                    sequenceData,
                    segmentName,
                    organism,
                )
            },
    )

    fun decompressSequencesInProcessedData(processedData: ProcessedData, organism: Organism) = ProcessedData(
        processedData.metadata,
        processedData
            .unalignedNucleotideSequences.mapValues {
                decompressNucleotideSequence(
                    it.value,
                    it.key,
                    organism,
                )
            },
        processedData.alignedNucleotideSequences.mapValues {
            decompressNucleotideSequence(
                it.value,
                it.key,
                organism,
            )
        },
        processedData.nucleotideInsertions,
        processedData.alignedAminoAcidSequences.mapValues {
            decompressAminoAcidSequence(
                it.value,
                it.key,
                organism,
            )
        },
        processedData.aminoAcidInsertions,
    )

    fun compressSequencesInProcessedData(processedData: ProcessedData, organism: Organism) = ProcessedData(
        processedData.metadata,
        processedData
            .unalignedNucleotideSequences.mapValues { (segmentName, sequenceData) ->
                compressNucleotideSequence(
                    sequenceData,
                    segmentName,
                    organism,
                )
            },
        processedData.alignedNucleotideSequences.mapValues {
            compressNucleotideSequence(
                it.value,
                it.key,
                organism,
            )
        },
        processedData.nucleotideInsertions,
        processedData.alignedAminoAcidSequences.mapValues {
            compressAminoAcidSequence(
                it.value,
                it.key,
                organism,
            )
        },
        processedData.aminoAcidInsertions,

    )

    private fun compress(seq: String, dictionary: ByteArray?): String {
        val input = seq.toByteArray(StandardCharsets.UTF_8)
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

        return Base64.getEncoder().encodeToString(outputBuffer.copyOfRange(0, compressionReturnCode.toInt()))
    }

    private fun decompress(compressedSequenceString: String, dictionary: ByteArray?): String {
        val compressed = Base64.getDecoder().decode(compressedSequenceString)
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
            )?.toByteArray()

    private fun getDictionaryForAminoAcidSequence(geneName: String, organism: Organism): ByteArray? = backendConfig
        .getInstanceConfig(organism)
        .referenceGenomes
        .getAminoAcidGeneReference(
            geneName,
        )?.toByteArray()
}
