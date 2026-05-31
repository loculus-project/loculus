package org.loculus.backend.service

import io.mockk.every
import io.mockk.mockk
import kotlinx.datetime.LocalDateTime
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasKey
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Insertion
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.config.Schema
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.service.submission.ProcessedSequencesPostprocessor

fun <K, V> assertMapStorage(actual: Map<K, V>, expected: Map<K, V>, presentSeg: K, absentSegs: List<K>) {
    absentSegs.forEach { key ->
        assertThat(actual, not(hasKey(key)))
    }
    assertThat(actual, hasKey(presentSeg))
    assertEquals(expected[presentSeg], actual[presentSeg])
}

fun <K, V> assertMapRetrieval(actual: Map<K, V>, expected: Map<K, V>, presentKeys: List<K>, absentSegs: List<K>) {
    presentKeys.forEach { key ->
        assertEquals(expected[key], actual[key])
    }
    absentSegs.forEach { key ->
        assertThat(actual, not(hasKey(key)))
    }
}

class ProcessedSequencesPostprocessorTest {

    private val configService: ConfigService = mockk()
    private val processedSequencesPostprocessor = ProcessedSequencesPostprocessor(configService)

    @Test
    fun `Processed Sequences Postprocessor correctly round trips sequences`() {
        val organism = Organism("multiSegment")
        val configuredPresentSeg = "seg1"
        val configuredNullSeg = "seg2"
        val configuredPresentGene = "gene1"
        val configuredNullGene = "gene2"

        every { configService.getOrganismConfig(organism) } returns ConfigService.VersionedOrganism(
            key = organism.name,
            version = 1L,
            publishedAt = LocalDateTime(2024, 1, 1, 0, 0),
            publishedBy = "test",
            config = OrganismConfig(
                schema = Schema(organismName = "Test", metadata = emptyList()),
                referenceGenome = ReferenceGenome(
                    nucleotideSequences = listOf(
                        ReferenceSequence(configuredPresentSeg, "AAAA"),
                        ReferenceSequence(configuredNullSeg, "CCCC"),
                    ),
                    genes = listOf(
                        ReferenceSequence(configuredPresentGene, "MMMM"),
                        ReferenceSequence(configuredNullGene, "AAAA"),
                    ),
                ),
            ),
        )

        val unconfiguredPresentSeg = "unconfigured_present"
        val unconfiguredNullSeg = "unconfigured_null"
        val unconfiguredPresentGene = "unconfigured_present"
        val unconfiguredNullGene = "unconfigured_null"

        val testData = ProcessedData<String>(
            metadata = emptyMap(),
            unalignedNucleotideSequences = mapOf(
                configuredPresentSeg to "ATCGTACGATCG",
                configuredNullSeg to null,
                unconfiguredPresentSeg to "NNGATCGTACGATC",
                unconfiguredNullSeg to null,
            ),
            alignedNucleotideSequences = mapOf(
                configuredPresentSeg to "ATCGTACGATCG",
                configuredNullSeg to null,
                unconfiguredPresentSeg to "GATCGTACGATC",
                unconfiguredNullSeg to null,
            ),
            nucleotideInsertions = mapOf(
                configuredPresentSeg to listOf(Insertion(13, "TT")),
                configuredNullSeg to emptyList(),
                unconfiguredPresentSeg to listOf(Insertion(13, "TT")),
                unconfiguredNullSeg to emptyList(),
            ),
            alignedAminoAcidSequences = mapOf(
                configuredPresentGene to "ATCGTACGATCG",
                configuredNullGene to null,
                unconfiguredPresentGene to "GATCGTACGATC",
                unconfiguredNullGene to null,
            ),
            aminoAcidInsertions = mapOf(
                configuredPresentGene to listOf(Insertion(13, "TT")),
                configuredNullGene to emptyList(),
                unconfiguredPresentGene to listOf(Insertion(13, "TT")),
                unconfiguredNullGene to emptyList(),
            ),
            sequenceNameToFastaId = mapOf(
                "configuredPresentSeg" to "header1",
                "unconfiguredPresentSeg" to "header2",
            ),
            files = null,
        )

        val condensed = processedSequencesPostprocessor.stripNullValuesFromSequences(testData)
        val expanded = processedSequencesPostprocessor.filterOutExtraSequencesAndAddNulls(condensed, organism)

        val absentSegs = listOf(configuredNullSeg, unconfiguredNullSeg)
        val presentSeg = configuredPresentSeg
        val retrievalPresentSegs = listOf(configuredPresentSeg, configuredNullSeg)
        val retrievalAbsentSegs = listOf(unconfiguredPresentSeg, unconfiguredNullSeg)

        val absentGenes = listOf(configuredNullGene, unconfiguredNullGene)
        val presentGene = configuredPresentGene
        val retrievalPresentGenes = listOf(configuredPresentGene, configuredNullGene)
        val retrievalAbsentGenes = listOf(unconfiguredPresentGene, unconfiguredNullGene)

        assertMapStorage(
            condensed.unalignedNucleotideSequences,
            testData.unalignedNucleotideSequences,
            presentSeg,
            absentSegs,
        )
        assertMapStorage(
            condensed.alignedNucleotideSequences,
            testData.alignedNucleotideSequences,
            presentSeg,
            absentSegs,
        )
        assertMapStorage(condensed.nucleotideInsertions, testData.nucleotideInsertions, presentSeg, absentSegs)
        assertMapStorage(
            condensed.alignedAminoAcidSequences,
            testData.alignedAminoAcidSequences,
            presentGene,
            absentGenes,
        )
        assertMapStorage(condensed.aminoAcidInsertions, testData.aminoAcidInsertions, presentGene, absentGenes)

        assertMapRetrieval(
            expanded.unalignedNucleotideSequences,
            testData.unalignedNucleotideSequences,
            retrievalPresentSegs,
            retrievalAbsentSegs,
        )
        assertMapRetrieval(
            expanded.alignedNucleotideSequences,
            testData.alignedNucleotideSequences,
            retrievalPresentSegs,
            retrievalAbsentSegs,
        )
        assertMapRetrieval(
            expanded.nucleotideInsertions,
            testData.nucleotideInsertions,
            retrievalPresentSegs,
            retrievalAbsentSegs,
        )
        assertMapRetrieval(
            expanded.alignedAminoAcidSequences,
            testData.alignedAminoAcidSequences,
            retrievalPresentGenes,
            retrievalAbsentGenes,
        )
        assertMapRetrieval(
            expanded.aminoAcidInsertions,
            testData.aminoAcidInsertions,
            retrievalPresentGenes,
            retrievalAbsentGenes,
        )
    }
}
