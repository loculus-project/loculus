package org.loculus.backend.service

import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
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
        val decompressed = compressor.decompressSequencesInOriginalData(compressed, organism)

        assertEquals(testData, decompressed)
    }

    @Test
    fun `Metadata handling in compression and decompression of ProcessedData`() {
        val organism = Organism(backendConfig.organisms.keys.first())
        val configuredFields = backendConfig.getInstanceConfig(organism).schema.metadata.map { it.name }
        require(configuredFields.size >= 2) { "Test requires at least 2 configured metadata fields" }

        val configuredPresent = configuredFields[0]
        val configuredNull = configuredFields[1]
        val unconfiguredPresent = "unconfigured_present"
        val unconfiguredNull = "unconfigured_null"

        val testData = ProcessedData<String>(
            metadata = mapOf(
                configuredPresent to TextNode("value1"),
                configuredNull to NullNode.instance,
                unconfiguredPresent to TextNode("value2"),
                unconfiguredNull to NullNode.instance,
            ),
            unalignedNucleotideSequences = emptyMap(),
            alignedNucleotideSequences = emptyMap(),
            nucleotideInsertions = emptyMap(),
            alignedAminoAcidSequences = emptyMap(),
            aminoAcidInsertions = emptyMap(),
        )

        val compressed = compressor.compressProcessedData(testData, organism)
        val decompressed = compressor.decompressProcessedData(compressed, organism)

        // Check compression behavior
        assertFalse(compressed.metadata.containsKey(configuredNull))
        assertFalse(compressed.metadata.containsKey(unconfiguredNull))
        assertTrue(compressed.metadata.containsKey(configuredPresent))
        assertTrue(compressed.metadata.containsKey(unconfiguredPresent))
        assertEquals(compressed.metadata[configuredPresent], testData.metadata[configuredPresent])

        // Check decompression behavior
        assertEquals(decompressed.metadata[configuredPresent], testData.metadata[configuredPresent])
        assertEquals(decompressed.metadata[configuredNull], testData.metadata[configuredNull])
        assertFalse(decompressed.metadata.containsKey(unconfiguredPresent))
        assertFalse(decompressed.metadata.containsKey(unconfiguredNull))
    }
}
