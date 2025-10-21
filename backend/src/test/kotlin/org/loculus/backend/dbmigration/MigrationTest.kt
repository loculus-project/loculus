package org.loculus.backend.dbmigration

import com.fasterxml.jackson.databind.node.TextNode
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.submission.SOME_LONG_GENE
import org.loculus.backend.controller.submission.SOME_SHORT_GENE
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class CompressionDictMigrationTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `single segmented released data should show uncompressed sequences`() {
        val releasedAccessionVersion = "LOC_000001Y.1"
        val revokedAccessionVersion = "LOC_00000MR.1"
        val revocationAccessionVersion = "LOC_00000MR.2"

        val releasedData = convenienceClient.getReleasedData()

        assertThat(releasedData, hasSize(30))

        val releasedEntry = findSequenceEntry(releasedData, accessionVersion = releasedAccessionVersion)
        assertThat(
            releasedEntry.unalignedNucleotideSequences,
            `is`(mapOf("main" to "NNACTGNN")),
        )
        assertThat(
            releasedEntry.alignedNucleotideSequences,
            `is`(mapOf("main" to "ATTAAAGGTTTATACCTTCCCAGGTAACAAACCAACCAACTTTCGATCT")),
        )
        assertThat(
            releasedEntry.alignedAminoAcidSequences,
            `is`(mapOf("someLongGene" to "ACDEFGHIKLMNPQRSTVWYBZX-*", "someShortGene" to "MADS")),
        )

        val revokedEntry = findSequenceEntry(releasedData, accessionVersion = revokedAccessionVersion)
        assertThat(
            revokedEntry.unalignedNucleotideSequences,
            `is`(mapOf("main" to "NNACTGNN")),
        )
        assertThat(
            revokedEntry.alignedNucleotideSequences,
            `is`(mapOf("main" to "ATTAAAGGTTTATACCTTCCCAGGTAACAAACCAACCAACTTTCGATCT")),
        )
        assertThat(
            revokedEntry.alignedAminoAcidSequences,
            `is`(mapOf("someLongGene" to "ACDEFGHIKLMNPQRSTVWYBZX-*", "someShortGene" to "MADS")),
        )

        val revocationEntry = findSequenceEntry(releasedData, accessionVersion = revocationAccessionVersion)
        assertThat(
            revocationEntry.unalignedNucleotideSequences,
            `is`(mapOf("main" to null)),
        )
        assertThat(
            revocationEntry.alignedNucleotideSequences,
            `is`(mapOf("main" to null)),
        )
        assertThat(
            revocationEntry.alignedAminoAcidSequences,
            `is`(mapOf("someLongGene" to null, "someShortGene" to null)),
        )
    }

    @Test
    fun `multi segmented released data should show uncompressed sequences`() {
        val releasedData = convenienceClient.getReleasedData(organism = OTHER_ORGANISM)

        assertThat(releasedData, hasSize(10))

        val releasedEntry = findSequenceEntry(releasedData, accessionVersion = "LOC_000017K.1")
        assertThat(
            releasedEntry.unalignedNucleotideSequences,
            `is`(mapOf("notOnlySegment" to "NNACTGNN", "secondSegment" to "NNATAGN")),
        )
        assertThat(
            releasedEntry.alignedNucleotideSequences,
            `is`(mapOf("notOnlySegment" to "ATTA", "secondSegment" to "ACGTMRWSYKVHDBN-")),
        )
        assertThat(
            releasedEntry.alignedAminoAcidSequences,
            `is`(mapOf(SOME_LONG_GENE to "ACDEFGHIKLMNPQRSTVWYBZX-*", SOME_SHORT_GENE to "MADS")),
        )
    }

    @Test
    fun `the preprocessing pipeline gets correctly uncompressed original sequences`() {
        val unprocessedData = convenienceClient.extractUnprocessedData()

        assertThat(unprocessedData, hasSize(10))

        val extractedSequenceEntry = unprocessedData.find { it.accession == "LOC_00000BC" }!!

        assertThat(
            extractedSequenceEntry.data.unalignedNucleotideSequences,
            `is`(mapOf("main" to "ACTG")),
        )
    }

    private fun findSequenceEntry(
        releasedData: List<ProcessedData<GeneticSequence>>,
        accessionVersion: String,
    ): ProcessedData<GeneticSequence> =
        releasedData.find { it.metadata["accessionVersion"] == TextNode(accessionVersion) }!!
}
