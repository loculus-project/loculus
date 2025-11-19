package org.loculus.backend.service

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasKey
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.api.Insertion
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.submission.ProcessedSequencesPostprocessor
import org.springframework.beans.factory.annotation.Autowired

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

@SpringBootTestWithoutDatabase
class ProcessedSequencesPostprocessorTest(
    @Autowired private val processedSequencesPostprocessor: ProcessedSequencesPostprocessor,
    @Autowired private val backendConfig: BackendConfig,
) {

    @Test
    fun `Processed Sequences Postprocessor correctly round trips sequences`() {
        val organism = Organism("otherOrganism")
        val configuredSequences = backendConfig.getInstanceConfig(organism).referenceGenome.nucleotideSequences
            .map { it.name }
            .sorted()
        require(configuredSequences.size >= 2) { "Test requires at least 2 configured sequences" }

        val configuredGenes = backendConfig.getInstanceConfig(organism).referenceGenome.genes
            .map { it.name }
            .sorted()
        require(configuredGenes.size >= 2) { "Test requires at least 2 configured genes" }

        val configuredPresentSeg = configuredSequences[0]
        val configuredNullSeg = configuredSequences[1]
        val unconfiguredPresentSeg = "unconfigured_present"
        val unconfiguredNullSeg = "unconfigured_null"

        val configuredPresentGene = configuredGenes[0]
        val configuredNullGene = configuredGenes[1]
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
            sequenceNameToFastaHeaderMap = mapOf(
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

        // Check storage
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

        // Check retrieval
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
