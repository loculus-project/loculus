package org.loculus.backend.service

import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.service.submission.CompressionDictService
import org.loculus.backend.service.submission.CompressionService
import org.loculus.backend.service.submission.DictEntry

class CompressionServiceTest {
    private val compressionDictServiceMock = mockk<CompressionDictService>()

    private val compressor = CompressionService(
        compressionDictService = compressionDictServiceMock,
    )

    @Test
    fun `Round trip compress and decompress sequences in original data`() {
        val organism = Organism("test organism")

        val dict = "NNACTGACTGACTGACTGATCGATCGATCGATCGATCGATCGATC".toByteArray()
        every { compressionDictServiceMock.getDictForUnalignedSequence(organism) } returns DictEntry(
            id = 1,
            dict = dict,
        )
        every { compressionDictServiceMock.getDictById(1) } returns dict

        val input =
            "NNACTGACTGACTGACTGATCGATCGATCGATCGATCGATCGATC----NNNNATCGCGATCGATCGATCGATCGGGATCGTAGC--NNNNATGC"

        val segmentName = "main"
        val testData = OriginalData(
            mapOf("test" to "test"),
            mapOf(segmentName to input),
        )
        val compressed = compressor.compressSequencesInOriginalData(testData, organism)
        val decompressed = compressor.decompressSequencesInOriginalData(compressed)

        assertEquals(testData, decompressed)
    }
}
