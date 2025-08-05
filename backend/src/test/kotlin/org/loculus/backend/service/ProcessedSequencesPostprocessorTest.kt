package org.loculus.backend.service

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasKey
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.DataUseTerms
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.config.Schema
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.service.submission.ProcessedSequencesPostprocessor
import org.springframework.beans.factory.annotation.Autowired

private const val FIRST_NUCLEOTIDE_SEQUENCE = "firstNucleotideSequence"
private const val SECOND_NUCLEOTIDE_SEQUENCE = "secondNucleotideSequence"
private const val FIRST_AMINO_ACID_SEQUENCE = "firstAminoAcidSequence"
private const val SECOND_AMINO_ACID_SEQUENCE = "secondAminoAcidSequence"

@SpringBootTestWithoutDatabase
class ProcessedSequencesPostprocessorTest(
    @Autowired private val processedSequencesPostprocessor: ProcessedSequencesPostprocessor,
) {

    @Test
    fun `Processed Sequences Postprocessor correctly round trips sequences`() {
        val backendConfig = BackendConfig(
            accessionPrefix = "LOC_",
            organisms = mapOf(
                DEFAULT_ORGANISM to InstanceConfig(
                    schema = Schema(
                        FIRST_NUCLEOTIDE_SEQUENCE,
                        listOf(),
                    ),
                    referenceGenome = ReferenceGenome(
                        listOf(
                            ReferenceSequence(FIRST_NUCLEOTIDE_SEQUENCE, "the sequence"),
                            ReferenceSequence(SECOND_NUCLEOTIDE_SEQUENCE, "the sequence"),
                        ),
                        listOf(
                            ReferenceSequence(FIRST_AMINO_ACID_SEQUENCE, "the sequence"),
                            ReferenceSequence(SECOND_AMINO_ACID_SEQUENCE, "the sequence"),
                        ),
                    ),
                ),
            ),
            dataUseTerms = DataUseTerms(true, null),
            websiteUrl = "example.com",
            backendUrl = "http://dummy-backend.com",
        )
        val organism = Organism(backendConfig.organisms.keys.first())
        val configuredSequences = backendConfig.getInstanceConfig(organism).referenceGenome.nucleotideSequences
            .map { it.name }
            .sorted()
        require(configuredSequences.size >= 2) { "Test requires at least 2 configured sequences" }

        val configuredPresent = configuredSequences[0]
        val configuredNull = configuredSequences[1]
        val unconfiguredPresent = "unconfigured_present"
        val unconfiguredNull = "unconfigured_null"

        val testData = ProcessedData<String>(
            metadata = emptyMap(),
            unalignedNucleotideSequences = mapOf(
                configuredPresent to "ATCGTACGATCG",
                configuredNull to null,
                unconfiguredPresent to "NNGATCGTACGATC",
                unconfiguredNull to null,
            ),
            alignedNucleotideSequences = mapOf(
                configuredPresent to "ATCGTACGATCG",
                configuredNull to null,
                unconfiguredPresent to "GATCGTACGATC",
                unconfiguredNull to null,
            ),
            nucleotideInsertions = emptyMap(),
            alignedAminoAcidSequences = emptyMap(),
            aminoAcidInsertions = emptyMap(),
            files = null,
        )

        val condensed = processedSequencesPostprocessor.stripNullValuesFromSequences(testData)
        val expanded = processedSequencesPostprocessor.filterOutExtraSequencesAndAddNulls(condensed, organism)

        // Check storage
        assertThat(condensed.unalignedNucleotideSequences, not(hasKey(configuredNull)))
        assertThat(condensed.unalignedNucleotideSequences, not(hasKey(unconfiguredNull)))
        assertThat(condensed.unalignedNucleotideSequences, hasKey(configuredPresent))
        assertThat(condensed.unalignedNucleotideSequences, hasKey(unconfiguredPresent))
        assertEquals(condensed.unalignedNucleotideSequences[configuredPresent], testData.unalignedNucleotideSequences[configuredPresent])

        // Check storage retrieval
        assertEquals(expanded.unalignedNucleotideSequences[configuredPresent], testData.unalignedNucleotideSequences[configuredPresent])
        assertEquals(expanded.unalignedNucleotideSequences[configuredNull], testData.unalignedNucleotideSequences[configuredNull])
        assertThat(expanded.unalignedNucleotideSequences, not(hasKey(unconfiguredPresent)))
        assertThat(expanded.unalignedNucleotideSequences, not(hasKey(unconfiguredNull)))
    }
}
