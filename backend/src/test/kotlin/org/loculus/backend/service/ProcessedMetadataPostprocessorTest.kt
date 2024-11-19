package org.loculus.backend.service

import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasKey
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Assertions.assertEquals
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
        assertThat(compressed.metadata, not(hasKey(configuredNull)))
        assertThat(compressed.metadata, not(hasKey(unconfiguredNull)))
        assertThat(compressed.metadata, hasKey(configuredPresent))
        assertThat(compressed.metadata, hasKey(unconfiguredPresent))
        assertEquals(compressed.metadata[configuredPresent], testData.metadata[configuredPresent])

        // Check decompression behavior
        assertEquals(decompressed.metadata[configuredPresent], testData.metadata[configuredPresent])
        assertEquals(decompressed.metadata[configuredNull], testData.metadata[configuredNull])
        assertThat(decompressed.metadata, not(hasKey(unconfiguredPresent)))
        assertThat(decompressed.metadata, not(hasKey(unconfiguredNull)))
    }
}
