package org.loculus.backend.service.submission

import com.github.luben.zstd.Zstd
import com.github.luben.zstd.ZstdCompressCtx
import com.github.luben.zstd.ZstdDecompressCtx
import com.github.luben.zstd.ZstdDictCompress
import com.github.luben.zstd.ZstdDictDecompress
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SubmittedData
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedDeque
import java.util.concurrent.atomic.AtomicInteger

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
    private val compressionDictService: CompressionDictService,
    private val backendConfig: BackendConfig,
) {

    fun compressSubmittedSequence(sequenceData: GeneticSequence, organism: Organism) = compress(
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

    private fun decompressNucleotideSequence(compressedSequence: CompressedSequence): GeneticSequence = decompress(
        compressedSequence,
    )

    private fun compressAminoAcidSequence(
        uncompressedSequence: String,
        gene: String,
        organism: Organism,
    ): CompressedSequence = compress(
        uncompressedSequence,
        compressionDictService.getDictForSegmentOrGene(organism, gene),
    )

    private fun decompressAminoAcidSequence(compressedSequence: CompressedSequence): GeneticSequence = decompress(
        compressedSequence,
    )

    fun decompressSequencesInSubmittedData(submittedData: SubmittedData<CompressedSequence>) = SubmittedData(
        submittedData.metadata,
        submittedData
            .unalignedNucleotideSequences.mapValues {
                when (val compressedSequence = it.value) {
                    null -> null
                    else -> decompressNucleotideSequence(compressedSequence)
                }
            },
        submittedData.files,
    )

    fun compressSequencesInSubmittedData(submittedData: SubmittedData<GeneticSequence>, organism: Organism) =
        SubmittedData(
            submittedData.metadata,
            submittedData
                .unalignedNucleotideSequences.mapValues { (_, sequenceData) ->
                    when (sequenceData) {
                        null -> null
                        else -> compressSubmittedSequence(sequenceData, organism)
                    }
                },
            submittedData.files,
        )

    fun decompressSequencesInProcessedData(processedData: ProcessedData<CompressedSequence>) = ProcessedData(
        processedData.metadata,
        processedData
            .unalignedNucleotideSequences.mapValues { (_, sequenceData) ->
                when (sequenceData) {
                    null -> null
                    else -> decompressNucleotideSequence(sequenceData)
                }
            },
        processedData.alignedNucleotideSequences.mapValues { (_, sequenceData) ->
            when (sequenceData) {
                null -> null
                else -> decompressNucleotideSequence(sequenceData)
            }
        },
        processedData.nucleotideInsertions,
        processedData.alignedAminoAcidSequences.mapValues { (_, sequenceData) ->
            when (sequenceData) {
                null -> null
                else -> decompressAminoAcidSequence(sequenceData)
            }
        },
        processedData.aminoAcidInsertions,
        processedData.sequenceNameToFastaId,
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
        processedData.sequenceNameToFastaId,
        processedData.files,
    )

    private fun compress(sequence: GeneticSequence, dictEntry: DictEntry?): CompressedSequence {
        val input = sequence.toByteArray(StandardCharsets.UTF_8)
        val outputBuffer = ByteArray(Zstd.compressBound(input.size.toLong()).toInt())
        val level = backendConfig.zstdCompressionLevel

        val compressedSize: Int = when {
            dictEntry == null -> noDictCompressContexts.use { it.compress(outputBuffer, input) }

            contextOutputMatchesOneShot(input.size, dictEntry.dict.size) -> {
                val dict = compressDicts.computeIfAbsent(dictEntry.id) { ZstdDictCompress(dictEntry.dict, level) }
                dictCompressContexts.use { it.loadDict(dict).compress(outputBuffer, input) }
            }

            else -> {
                val returnCode = Zstd.compress(outputBuffer, input, dictEntry.dict, level)
                if (Zstd.isError(returnCode)) {
                    throw RuntimeException("Zstd compression failed: error code $returnCode")
                }
                returnCode.toInt()
            }
        }

        return CompressedSequence(
            compressedSequence = Base64.getEncoder()
                .encodeToString(outputBuffer.copyOfRange(0, compressedSize)),
            compressionDictId = dictEntry?.id,
        )
    }

    private fun decompress(compressedSequence: CompressedSequence): String {
        val compressed = Base64.getDecoder().decode(compressedSequence.compressedSequence)
        val decompressedSize = Zstd.getFrameContentSize(compressed)
        if (Zstd.isError(decompressedSize)) {
            throw RuntimeException("reading Zstd decompressed size failed: error code $decompressedSize")
        }

        val decompressedBuffer = ByteArray(decompressedSize.toInt())
        val dictId = compressedSequence.compressionDictId
        val length = if (dictId == null) {
            noDictDecompressContexts.use { it.decompress(decompressedBuffer, compressed) }
        } else {
            // not computeIfAbsent: getDictById may query the database, which must not run under the map's lock
            val dict = decompressDicts[dictId]
                ?: ZstdDictDecompress(compressionDictService.getDictById(dictId)).let {
                    decompressDicts.putIfAbsent(dictId, it) ?: it
                }
            dictDecompressContexts.use { it.loadDict(dict).decompress(decompressedBuffer, compressed) }
        }
        return String(decompressedBuffer, 0, length, StandardCharsets.UTF_8)
    }

    // Prepared dictionaries, keyed by compression dictionary id. Dictionary rows are content-addressed and never
    // change, and ZSTD_CDict/ZSTD_DDict are read-only once built, so one instance is shared by all threads.
    private val compressDicts = ConcurrentHashMap<Int, ZstdDictCompress>()
    private val decompressDicts = ConcurrentHashMap<Int, ZstdDictDecompress>()

    // Contexts are pooled rather than thread-local: a ThreadLocal would hold one native context per Tomcat thread
    // and allocate a new one for every virtual thread, while a pool holds about as many as are used concurrently.
    // A context that has referenced a dictionary cannot drop it again, hence separate pools for dictionary-less use.
    private val dictCompressContexts = ContextPool { ZstdCompressCtx().setLevel(backendConfig.zstdCompressionLevel) }
    private val noDictCompressContexts = ContextPool {
        ZstdCompressCtx().setLevel(backendConfig.zstdCompressionLevel)
    }
    private val dictDecompressContexts = ContextPool { ZstdDecompressCtx() }
    private val noDictDecompressContexts = ContextPool { ZstdDecompressCtx() }
}

/**
 * Whether compressing with a context that references a prepared dictionary gives the same frame as the one-shot
 * `Zstd.compress(dst, src, dictBytes, level)` used for all data stored so far.
 *
 * zstd compresses with the prepared dictionary's parameters unless the input is at least 128 KiB AND at least
 * 6x the dictionary (ZSTD_USE_CDICT_PARAMS_SRCSIZE_CUTOFF / _DICTSIZE_MULTIPLIER in zstd_compress.c). In that case
 * it re-derives parameters from the input size, and the frame then differs from the one-shot API. Such inputs
 * (a sequence much longer than its reference) keep using the one-shot API, so stored bytes stay identical.
 */
internal fun contextOutputMatchesOneShot(inputSize: Int, dictSize: Int): Boolean =
    inputSize < 128 * 1024 || inputSize.toLong() < 6L * dictSize

/**
 * Pool of native zstd contexts, striped by thread id so that threads do not all contend on one queue head
 * (a single shared deque measured 15% slower than one-shot calls for decompression with 8 threads).
 * Each stripe keeps at most [MAX_IDLE_PER_STRIPE] idle contexts; surplus ones are closed on return.
 */
private class ContextPool<T : AutoCloseable>(private val create: () -> T) {
    private class Stripe<T> {
        val idle = ConcurrentLinkedDeque<T>()
        val idleCount = AtomicInteger()
    }

    private val stripes = Array(STRIPES) { Stripe<T>() }

    fun <R> use(block: (T) -> R): R {
        val stripe = stripes[(Thread.currentThread().threadId() and (STRIPES - 1).toLong()).toInt()]
        val context = stripe.idle.pollFirst()?.also { stripe.idleCount.decrementAndGet() } ?: create()
        val result = try {
            block(context)
        } catch (e: Throwable) {
            context.close()
            throw e
        }
        if (stripe.idleCount.incrementAndGet() <= MAX_IDLE_PER_STRIPE) {
            stripe.idle.offerFirst(context)
        } else {
            stripe.idleCount.decrementAndGet()
            context.close()
        }
        return result
    }

    private companion object {
        val STRIPES = Integer.highestOneBit(Runtime.getRuntime().availableProcessors() * 2 - 1).coerceAtLeast(1)
        const val MAX_IDLE_PER_STRIPE = 8
    }
}
