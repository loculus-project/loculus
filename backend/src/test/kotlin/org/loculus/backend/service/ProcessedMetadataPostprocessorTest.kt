package org.loculus.backend.service

import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import io.mockk.every
import io.mockk.mockk
import kotlinx.datetime.LocalDateTime
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasKey
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.Metadata
import org.loculus.backend.config.MetadataType
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.Schema
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.service.submission.ProcessedMetadataPostprocessor

class ProcessedMetadataPostprocessorTest {

    private val configService: ConfigService = mockk()
    private val processedMetadataPostprocessor = ProcessedMetadataPostprocessor(configService)

    @Test
    fun `Processed Metadata Postprocessor correctly round trips metadata`() {
        val organism = Organism("dummy")
        val configuredPresent = "country"
        val configuredNull = "date"
        val unconfiguredPresent = "unconfigured_present"
        val unconfiguredNull = "unconfigured_null"

        every { configService.getOrganismConfig(organism) } returns ConfigService.VersionedOrganism(
            key = organism.name,
            version = 1L,
            publishedAt = LocalDateTime(2024, 1, 1, 0, 0),
            publishedBy = "test",
            config = OrganismConfig(
                schema = Schema(
                    organismName = "Test",
                    metadata = listOf(
                        Metadata(name = configuredPresent, type = MetadataType.STRING),
                        Metadata(name = configuredNull, type = MetadataType.DATE),
                    ),
                ),
                referenceGenome = ReferenceGenome(emptyList(), emptyList()),
            ),
        )

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
            sequenceNameToFastaId = emptyMap(),
            files = null,
        )

        val condensed = processedMetadataPostprocessor.stripNullValuesFromMetadata(testData)
        val expanded = processedMetadataPostprocessor.filterOutExtraFieldsAndAddNulls(condensed, organism)

        assertThat(condensed.metadata, not(hasKey(configuredNull)))
        assertThat(condensed.metadata, not(hasKey(unconfiguredNull)))
        assertThat(condensed.metadata, hasKey(configuredPresent))
        assertThat(condensed.metadata, hasKey(unconfiguredPresent))
        assertEquals(condensed.metadata[configuredPresent], testData.metadata[configuredPresent])

        assertEquals(expanded.metadata[configuredPresent], testData.metadata[configuredPresent])
        assertEquals(expanded.metadata[configuredNull], testData.metadata[configuredNull])
        assertThat(expanded.metadata, not(hasKey(unconfiguredPresent)))
        assertThat(expanded.metadata, not(hasKey(unconfiguredNull)))
    }
}
