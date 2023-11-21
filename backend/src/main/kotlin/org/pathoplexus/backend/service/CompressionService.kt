package org.pathoplexus.backend.service

import com.github.luben.zstd.Zstd
import org.pathoplexus.backend.api.Organism
import org.pathoplexus.backend.api.OriginalData
import org.pathoplexus.backend.config.BackendConfig
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

    fun compressUnalignedNucleotideSequence(
        uncompressedSequence: String,
        segmentName: String,
        organism: Organism,
    ): String =
        compress(
            uncompressedSequence,
            getDictionaryForNucleotideSequenceSegments(segmentName, organism),
        )

    private fun decompressUnalignedNucleotideSequence(
        compressedSequence: String,
        segmentName: String,
        organism: Organism,
    ): String = decompress(
        compressedSequence,
        getDictionaryForNucleotideSequenceSegments(segmentName, organism),
    )

    fun decompressSequencesInOriginalData(originalData: OriginalData, organism: Organism) =
        OriginalData(
            originalData.metadata,
            originalData
                .unalignedNucleotideSequences.mapValues {
                    decompressUnalignedNucleotideSequence(
                        it.value,
                        it.key,
                        organism,
                    )
                },
        )

    fun compressSequencesInOriginalData(originalData: OriginalData, organism: Organism) =
        OriginalData(
            originalData.metadata,
            originalData
                .unalignedNucleotideSequences.mapValues { (segmentName, sequenceData) ->
                    compressUnalignedNucleotideSequence(
                        sequenceData,
                        segmentName,
                        organism,
                    )
                },
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
        val decompressedSize = Zstd.decompressedSize(compressed).toInt()
        val decompressedBuffer = ByteArray(decompressedSize)
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

    private fun getDictionaryForNucleotideSequenceSegments(
        segmentName: String,
        organism: Organism,
    ): ByteArray? = backendConfig
        .getInstanceConfig(organism)
        .referenceGenomes
        .getNucleotideSegmentReference(
            segmentName,
        )?.toByteArray()
}
