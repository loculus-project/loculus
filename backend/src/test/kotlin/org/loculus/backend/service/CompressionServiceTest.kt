package org.loculus.backend.service

import com.github.luben.zstd.Zstd
import com.github.luben.zstd.ZstdCompressCtx
import com.github.luben.zstd.ZstdDictCompress
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.api.SubmittedData
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.service.submission.CompressedSequence
import org.loculus.backend.service.submission.CompressionDictService
import org.loculus.backend.service.submission.CompressionService
import org.loculus.backend.service.submission.DictEntry
import org.loculus.backend.service.submission.contextOutputMatchesOneShot
import java.util.Base64
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import kotlin.random.Random

private const val LEVEL = 10
private val organism = Organism(DEFAULT_ORGANISM)

class CompressionServiceTest {
    private val compressionDictServiceMock = mockk<CompressionDictService>()
    private val backendConfigMock = mockk<BackendConfig>().also {
        every { it.zstdCompressionLevel } returns LEVEL
    }

    private val compressor = CompressionService(
        compressionDictService = compressionDictServiceMock,
        backendConfig = backendConfigMock,
    )

    @Test
    fun `Round trip compress and decompress sequences in submitted data`() {
        val dict = "NNACTGACTGACTGACTGATCGATCGATCGATCGATCGATCGATC".toByteArray()
        every { compressionDictServiceMock.getDictForUnalignedSequence(organism) } returns DictEntry(
            id = 1,
            dict = dict,
        )
        every { compressionDictServiceMock.getDictById(1) } returns dict

        val input =
            "NNACTGACTGACTGACTGATCGATCGATCGATCGATCGATCGATC----NNNNATCGCGATCGATCGATCGATCGGGATCGTAGC--NNNNATGC"

        val segmentName = "main"
        val testData = SubmittedData(
            mapOf("test" to "test"),
            mapOf(segmentName to input),
        )
        val compressed = compressor.compressSequencesInSubmittedData(testData, organism)
        val decompressed = compressor.decompressSequencesInSubmittedData(compressed)

        assertEquals(testData, decompressed)
    }

    @Test
    fun `compressed bytes are identical to the one-shot zstd API and decode both ways`() {
        val cases = realisticCases()
        cases.forEach { (dict, sequence) -> assertMatchesOneShot(dict, sequence) }
    }

    @Test
    fun `inputs around the size where zstd re-derives parameters stay identical to the one-shot API`() {
        val random = Random(3)
        val longSequence = mutate(randomSequence(random, 400_000, NUCLEOTIDES), random, NUCLEOTIDES)
        val dict20k = DictEntry(id = 20, dict = longSequence.substring(0, 20_000).toByteArray())
        val dict25k = DictEntry(id = 25, dict = longSequence.substring(0, 25_000).toByteArray())
        val mpoxLike = DictEntry(id = 197, dict = longSequence.substring(100_000, 297_000).toByteArray())
        val sizes = listOf(
            dict20k to 131_071,
            dict20k to 131_072,
            dict20k to 131_073,
            dict25k to 149_999,
            dict25k to 150_000,
            dict25k to 150_001,
            dict20k to 400_000,
            mpoxLike to 197_000,
            mpoxLike to 199_000,
        )
        for ((dict, size) in sizes) {
            assertMatchesOneShot(dict, longSequence.substring(0, size))
        }

        // where the service uses the context path, the context path must really match the one-shot API
        val below = longSequence.substring(0, 131_071).toByteArray()
        assertTrue(contextOutputMatchesOneShot(below.size, dict20k.dict.size))
        ZstdCompressCtx().setLevel(LEVEL).use { ctx ->
            ctx.loadDict(ZstdDictCompress(dict20k.dict, LEVEL))
            assertTrue(oneShot(below, dict20k.dict).contentEquals(ctx.compress(below)))
        }
        assertFalse(contextOutputMatchesOneShot(131_072, 20_000))
        assertTrue(contextOutputMatchesOneShot(197_000, 197_000))
    }

    @Test
    fun `concurrent compression and decompression with interleaved dictionaries`() {
        val cases = realisticCases()
        val expected = cases.map { (dict, sequence) -> oneShotBase64(dict, sequence) }
        stubDictById(cases.mapNotNull { it.first })

        val executor = Executors.newFixedThreadPool(8)
        try {
            val tasks = (0 until 8).map { thread ->
                Callable {
                    repeat(20) { round ->
                        cases.indices.shuffled(Random(thread * 100 + round)).forEach { i ->
                            val (dict, sequence) = cases[i]
                            val compressed = compressWith(dict, sequence)
                            assertEquals(expected[i], compressed.compressedSequence)
                            assertEquals(sequence, decompress(compressed))
                        }
                    }
                }
            }
            executor.invokeAll(tasks).forEach { it.get() }
        } finally {
            executor.shutdown()
        }
    }

    private fun assertMatchesOneShot(dict: DictEntry?, sequence: String) {
        stubDictById(listOfNotNull(dict))
        val compressed = compressWith(dict, sequence)
        val oldBase64 = oneShotBase64(dict, sequence)
        assertEquals(oldBase64, compressed.compressedSequence, "dict=${dict?.dict?.size} length=${sequence.length}")
        assertEquals(dict?.id, compressed.compressionDictId)
        // new decoder on the frame the old code wrote, and old decoder on the frame the new code wrote
        assertEquals(sequence, decompress(CompressedSequence(oldBase64, dict?.id)))
        assertEquals(sequence, oneShotDecompress(compressed.compressedSequence, dict))
    }

    private fun compressWith(dict: DictEntry?, sequence: String): CompressedSequence {
        val submitted = SubmittedData(emptyMap(), mapOf("main" to sequence))
        return compressorFor(dict).compressSequencesInSubmittedData(submitted, organism)
            .unalignedNucleotideSequences.getValue("main")!!
    }

    private fun decompress(compressed: CompressedSequence): String =
        compressor.decompressSequencesInSubmittedData(SubmittedData(emptyMap(), mapOf("main" to compressed)))
            .unalignedNucleotideSequences.getValue("main")!!

    // compressSubmittedSequence reads the dictionary from getDictForUnalignedSequence; one mock per dictionary lets
    // the concurrent test interleave dictionaries without re-stubbing a shared mock across threads.
    private val compressorsByDict = HashMap<Int?, CompressionService>()

    @Synchronized
    private fun compressorFor(dict: DictEntry?): CompressionService = compressorsByDict.getOrPut(dict?.id) {
        val dictService = mockk<CompressionDictService>()
        every { dictService.getDictForUnalignedSequence(organism) } returns dict
        CompressionService(dictService, backendConfigMock)
    }

    private fun stubDictById(dicts: List<DictEntry>) {
        dicts.forEach { every { compressionDictServiceMock.getDictById(it.id) } returns it.dict }
    }
}

private const val NUCLEOTIDES = "ACGT"
private const val AMINO_ACIDS = "ACDEFGHIKLMNPQRSTVWY"

/** SARS-CoV-2-shaped data: segment, gene and concatenated dictionaries, and mutated copies of their references. */
private fun realisticCases(): List<Pair<DictEntry?, String>> {
    val random = Random(42)
    val genome = randomSequence(random, 29_903, NUCLEOTIDES)
    val spike = randomSequence(random, 1_273, AMINO_ACIDS)
    val orf8 = randomSequence(random, 121, AMINO_ACIDS)
    val segmentDict = DictEntry(id = 1, dict = genome.toByteArray())
    val spikeDict = DictEntry(id = 2, dict = spike.toByteArray())
    val orf8Dict = DictEntry(id = 3, dict = orf8.toByteArray())
    val concatenatedDict = DictEntry(id = 4, dict = (genome + randomSequence(random, 5_000, NUCLEOTIDES)).toByteArray())

    val cases = mutableListOf<Pair<DictEntry?, String>>()
    repeat(40) {
        val aligned = mutate(genome, random, NUCLEOTIDES)
        cases += segmentDict to aligned
        cases += concatenatedDict to aligned.trim('N').replace("-", "")
        cases += spikeDict to mutate(spike, random, AMINO_ACIDS)
        cases += orf8Dict to mutate(orf8, random, AMINO_ACIDS)
        cases += null to aligned.substring(0, random.nextInt(aligned.length))
    }
    cases += segmentDict to ""
    cases += spikeDict to "X"
    cases += null to ""
    return cases
}

private fun randomSequence(random: Random, length: Int, alphabet: String) =
    String(CharArray(length) { alphabet[random.nextInt(alphabet.length)] })

/** Substitutions, a leading/trailing N (or X) run and a deletion, as in aligned sequences. */
private fun mutate(reference: String, random: Random, alphabet: String): String {
    val chars = reference.toCharArray()
    repeat(chars.size / 300 + 1) { chars[random.nextInt(chars.size)] = alphabet[random.nextInt(alphabet.length)] }
    val unknown = if (alphabet == NUCLEOTIDES) 'N' else 'X'
    val leading = random.nextInt(minOf(200, chars.size))
    for (i in 0 until leading) chars[i] = unknown
    for (i in chars.size - random.nextInt(minOf(100, chars.size)) until chars.size) chars[i] = unknown
    val deletionStart = random.nextInt(chars.size)
    for (i in deletionStart until minOf(chars.size, deletionStart + random.nextInt(30))) chars[i] = '-'
    return String(chars)
}

private fun oneShot(input: ByteArray, dict: ByteArray?): ByteArray {
    val buffer = ByteArray(Zstd.compressBound(input.size.toLong()).toInt())
    val size = if (dict == null) Zstd.compress(buffer, input, LEVEL) else Zstd.compress(buffer, input, dict, LEVEL)
    check(!Zstd.isError(size))
    return buffer.copyOf(size.toInt())
}

private fun oneShotBase64(dict: DictEntry?, sequence: String): String =
    Base64.getEncoder().encodeToString(oneShot(sequence.toByteArray(), dict?.dict))

private fun oneShotDecompress(base64: String, dict: DictEntry?): String {
    val frame = Base64.getDecoder().decode(base64)
    val out = ByteArray(Zstd.getFrameContentSize(frame).toInt())
    val size = if (dict == null) Zstd.decompress(out, frame) else Zstd.decompress(out, frame, dict.dict)
    check(!Zstd.isError(size))
    return String(out, 0, size.toInt())
}
