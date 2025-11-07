package org.loculus.backend.service.submission

import com.github.luben.zstd.Zstd
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.util.Base64

data class CompressedSequence(val compressedSequence: String, val compressionDictId: Int?)

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
class CompressionService(
    private val backendConfig: BackendConfig,
    private val compressionDictService: CompressionDictService,
) {

    fun compressOriginalSequence(sequenceData: GeneticSequence, organism: Organism) = compress(
        sequenceData,
        compressionDictService.getDictForUnalignedSequence(organism),
    )

    private fun compressNucleotideSequence(
        uncompressedSequence: GeneticSequence,
        segmentName: String,
        organism: Organism,
    ): CompressedSequence = compress(
        uncompressedSequence,
        compressionDictService.getDictForSegmentOrGene(organism, segmentName),
    )

    private fun decompressNucleotideSequence(
        compressedSequence: CompressedSequence,
        segmentName: String,
        organism: Organism,
    ): GeneticSequence = decompress(
        compressedSequence,
        { getDictionaryForNucleotideSequenceSegment(segmentName, organism) },
    )

    private fun compressAminoAcidSequence(
        uncompressedSequence: String,
        gene: String,
        organism: Organism,
    ): CompressedSequence = compress(
        uncompressedSequence,
        compressionDictService.getDictForSegmentOrGene(organism, gene),
    )

    private fun decompressAminoAcidSequence(
        compressedSequence: CompressedSequence,
        gene: String,
        organism: Organism,
    ): GeneticSequence = decompress(
        compressedSequence,
        { getDictionaryForAminoAcidSequence(gene, organism) },
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
            originalData.files,
        )

    fun compressSequencesInOriginalData(originalData: OriginalData<GeneticSequence>, organism: Organism) = OriginalData(
        originalData.metadata,
        originalData
            .unalignedNucleotideSequences.mapValues { (_, sequenceData) ->
                when (sequenceData) {
                    null -> null
                    else -> compressOriginalSequence(sequenceData, organism)
                }
            },
        originalData.files,
    )

    fun decompressSequencesInProcessedData(processedData: ProcessedData<CompressedSequence>, organism: Organism) =
        ProcessedData(
            processedData.metadata,
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
            processedData.files,
        )

    fun compressSequencesInProcessedData(processedData: ProcessedData<String>, organism: Organism) = ProcessedData(
        processedData.metadata,
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
        processedData.files,
    )

    private fun compress(sequence: GeneticSequence, dictEntry: DictEntry?): CompressedSequence {
        val input = sequence.toByteArray(StandardCharsets.UTF_8)
        val compressBound = Zstd.compressBound(input.size.toLong()).toInt()
        val outputBuffer = ByteArray(compressBound)

        val compressionReturnCode: Long = if (dictEntry == null) {
            Zstd.compress(outputBuffer, input, 3)
        } else {
            Zstd.compress(outputBuffer, input, dictEntry.dict, 3)
        }

        if (Zstd.isError(compressionReturnCode)) {
            throw RuntimeException("Zstd compression failed: error code $compressionReturnCode")
        }

        return CompressedSequence(
            compressedSequence = Base64.getEncoder()
                .encodeToString(outputBuffer.copyOfRange(0, compressionReturnCode.toInt())),
            compressionDictId = dictEntry?.id,
        )
    }

    private fun decompress(compressedSequence: CompressedSequence, getFallbackDictionary: () -> ByteArray?): String {
        val compressed = Base64.getDecoder().decode(compressedSequence.compressedSequence)
        val decompressedSize = Zstd.getFrameContentSize(compressed)
        if (Zstd.isError(decompressedSize)) {
            throw RuntimeException("reading Zstd decompressed size failed: error code $decompressedSize")
        }

        val dictionary = compressedSequence.compressionDictId
            ?.let { compressionDictService.getDictById(it) }
            ?: getFallbackDictionary()

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
            .referenceGenome
            .getNucleotideSegmentReference(
                segmentName,
            )
            ?.toByteArray()

    private fun getDictionaryForAminoAcidSequence(geneName: String, organism: Organism): ByteArray? = backendConfig
        .getInstanceConfig(organism)
        .referenceGenome
        .getAminoAcidGeneReference(
            geneName,
        )
        ?.toByteArray()
}
