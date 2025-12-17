package org.loculus.backend.service.submission

import tools.jackson.databind.node.NullNode
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.DataUseTerms
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.Metadata
import org.loculus.backend.config.MetadataType
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.config.Schema
import org.loculus.backend.controller.DEFAULT_ORGANISM

private const val FIRST_METADATA_FIELD = "required"
private const val SECOND_METADATA_FIELD = "notRequired"
private const val FIRST_NUCLEOTIDE_SEQUENCE = "firstNucleotideSequence"
private const val SECOND_NUCLEOTIDE_SEQUENCE = "secondNucleotideSequence"
private const val FIRST_AMINO_ACID_SEQUENCE = "firstAminoAcidSequence"
private const val SECOND_AMINO_ACID_SEQUENCE = "secondAminoAcidSequence"

class EmptyProcessedDataProviderTest {
    private val underTest = EmptyProcessedDataProvider(
        BackendConfig(
            accessionPrefix = "LOC_",
            organisms = mapOf(
                DEFAULT_ORGANISM to InstanceConfig(
                    schema = Schema(
                        FIRST_NUCLEOTIDE_SEQUENCE,
                        listOf(
                            Metadata(name = FIRST_METADATA_FIELD, type = MetadataType.STRING, required = true),
                            Metadata(name = SECOND_METADATA_FIELD, type = MetadataType.DATE, required = false),
                        ),
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
        ),
    )

    @Test
    fun `GIVEN backend config for schema THEN returns processed data with all fields and sequences empty`() {
        val result = underTest.provide(organism = Organism(DEFAULT_ORGANISM))

        val expectedMetadata = mapOf(
            FIRST_METADATA_FIELD to NullNode.instance,
            SECOND_METADATA_FIELD to NullNode.instance,
        )
        assertThat(result.metadata, `is`(expectedMetadata))

        val expectedNucleotideSequences = mapOf(
            FIRST_NUCLEOTIDE_SEQUENCE to null,
            SECOND_NUCLEOTIDE_SEQUENCE to null,
        )
        assertThat(result.unalignedNucleotideSequences, `is`(expectedNucleotideSequences))
        assertThat(result.alignedNucleotideSequences, `is`(expectedNucleotideSequences))

        val expectedAminoAcidSequences = mapOf(
            FIRST_AMINO_ACID_SEQUENCE to null,
            SECOND_AMINO_ACID_SEQUENCE to null,
        )
        assertThat(result.alignedAminoAcidSequences, `is`(expectedAminoAcidSequences))

        val expectedNucleotideInsertions = mapOf(
            FIRST_NUCLEOTIDE_SEQUENCE to emptyList<String>(),
            SECOND_NUCLEOTIDE_SEQUENCE to emptyList(),
        )
        assertThat(result.nucleotideInsertions, `is`(expectedNucleotideInsertions))

        val expectedAminoAcidInsertions = mapOf(
            FIRST_AMINO_ACID_SEQUENCE to emptyList<String>(),
            SECOND_AMINO_ACID_SEQUENCE to emptyList(),
        )
        assertThat(result.aminoAcidInsertions, `is`(expectedAminoAcidInsertions))
    }
}
