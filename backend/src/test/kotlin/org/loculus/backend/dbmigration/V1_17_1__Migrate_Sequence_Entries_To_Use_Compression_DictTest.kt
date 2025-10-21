package org.loculus.backend.dbmigration

import com.fasterxml.jackson.databind.node.TextNode
import mu.KotlinLogging
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.PublicJwtKeyConfig
import org.loculus.backend.controller.SPRING_DATASOURCE_PASSWORD
import org.loculus.backend.controller.SPRING_DATASOURCE_URL
import org.loculus.backend.controller.SPRING_DATASOURCE_USERNAME
import org.loculus.backend.controller.datauseterms.DataUseTermsControllerClient
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.seqsetcitations.SeqSetCitationsControllerClient
import org.loculus.backend.controller.submission.SOME_LONG_GENE
import org.loculus.backend.controller.submission.SOME_SHORT_GENE
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.testutil.TestEnvironment
import org.loculus.backend.testutil.TestResource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource

private val log = KotlinLogging.logger { }

@AutoConfigureMockMvc
@SpringBootTest
@ActiveProfiles("with-database")
@Import(
    SubmissionControllerClient::class,
    SubmissionConvenienceClient::class,
    GroupManagementControllerClient::class,
    DataUseTermsControllerClient::class,
    SeqSetCitationsControllerClient::class,
    PublicJwtKeyConfig::class,
    FilesClient::class,
)
@Suppress("ktlint:standard:class-naming")
class V1_17_1__Migrate_Sequence_Entries_To_Use_Compression_DictTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    companion object {
        private val env = TestEnvironment()

        @JvmStatic
        @BeforeAll
        fun beforeAll() {
            env.start()

            env.postgres.restore(TestResource("MigrationTest_pg_dump.sql").file)

            log.info("started Postgres for migration: ${env.postgres.jdbcUrl}")
        }

        @JvmStatic
        @AfterAll
        fun afterAll() {
            env.stop()
        }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add(SPRING_DATASOURCE_URL) { env.postgres.jdbcUrl }
            registry.add(SPRING_DATASOURCE_USERNAME) { env.postgres.username }
            registry.add(SPRING_DATASOURCE_PASSWORD) { env.postgres.password }
        }
    }

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
