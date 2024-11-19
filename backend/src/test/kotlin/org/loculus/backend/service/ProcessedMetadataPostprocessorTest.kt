package org.loculus.backend.service

import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.submission.ProcessedMetadataPostprocessor
import org.springframework.beans.factory.annotation.Autowired

@SpringBootTestWithoutDatabase
class ProcessedMetadataPostprocessorTest(
    @Autowired private val processedMetadataPostprocessor: ProcessedMetadataPostprocessor,
    @Autowired private val backendConfig: BackendConfig,
) {

    @Test
    fun `Processed Metadata Postprocessor correctly round trips metadata`() {
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

        // "Compression" is only used in the sense that we are removing null values
        val compressed = processedMetadataPostprocessor.stripNullValuesFromMetadata(testData)
        val decompressed = processedMetadataPostprocessor.filterOutExtraFieldsAndAddNulls(compressed, organism)

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
