package org.loculus.backend.service

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.submission.CompressionService
import org.springframework.beans.factory.annotation.Autowired

@SpringBootTestWithoutDatabase
class CompressionServiceTest(
    @Autowired private val compressor: CompressionService,
    @Autowired private val backendConfig: BackendConfig,
) {

    @Test
    fun `Round trip compress and decompress sequences in original data`() {
        val input =
            "NNACTGACTGACTGACTGATCGATCGATCGATCGATCGATCGATC----NNNNATCGCGATCGATCGATCGATCGGGATCGTAGC--NNNNATGC"

        val segmentName = "main"
        val testData = OriginalData(
            mapOf("test" to "test"),
            mapOf(segmentName to input),
        )
        val organism = Organism(backendConfig.organisms.keys.first())
        val compressed = compressor.compressSequencesInOriginalData(testData, organism)
        val decompressed = compressor.decompressSequencesInOriginalData(compressed)

        assertEquals(testData, decompressed)
    }
}
