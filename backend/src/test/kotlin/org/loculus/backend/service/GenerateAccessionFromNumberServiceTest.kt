package org.loculus.backend.service

import io.mockk.every
import io.mockk.mockk
import kotlinx.datetime.LocalDateTime
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.loculus.backend.config.DataUseTerms
import org.loculus.backend.config.FileSharing
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.service.ConfigService
import java.lang.Math.random
import kotlin.math.pow

const val PREFIX = "LOC_"

class GenerateAccessionFromNumberServiceTest {
    private val configService: ConfigService = mockk()

    init {
        every { configService.getInstanceConfig() } returns ConfigService.VersionedInstance(
            version = 1L,
            publishedAt = LocalDateTime(2024, 1, 1, 0, 0),
            publishedBy = "test",
            config = InstanceConfig(
                name = "Loculus",
                accessionPrefix = PREFIX,
                dataUseTerms = DataUseTerms(true, null),
                fileSharing = FileSharing(),
            ),
        )
    }

    private val accessionFromNumberService = GenerateAccessionFromNumberService(configService)

    @Test
    fun `GIVEN sequence numbers and prefix THEN returns custom ids that are padded to 6 digits`() {
        val sequenceNumbers: List<Long> = listOf(
            1,
            1 * 34.0.pow(1.0).toLong() + 3,
            3 * 34.0.pow(2.0).toLong() + 2 * 34.0.pow(1.0).toLong() + 1,
        )

        val expectedAccessions = listOf(
            "${PREFIX}000001Y",
            "${PREFIX}000013T",
            "${PREFIX}000321Q",
        )

        val result = sequenceNumbers.map { accessionFromNumberService.generateCustomId(it) }

        assertThat(result, `is`(expectedAccessions))
    }

    @Test
    fun `GIVEN large sequence numbers THEN returns longer custom ids `() {
        val sequenceNumber: Long = 34.0.pow(6.0).toLong() + 1

        assertThat(accessionFromNumberService.generateCustomId(sequenceNumber), `is`("${PREFIX}1000001W"))
    }

    @Test
    fun `GIVEN a valid accession THEN the validation succeeds`() {
        val sequenceNumber = (random() * 1e6).toLong()

        val accession = accessionFromNumberService.generateCustomId(sequenceNumber)

        val isValidAccession = accessionFromNumberService.validateAccession(accession)
        assertThat(isValidAccession, `is`(true))
    }

    @Test
    fun `GIVEN an accession without prefix THEN the validation fails`() {
        val sequenceNumber = (random() * 1e6).toLong()

        val accessionWithoutPrefix = accessionFromNumberService
            .generateCustomId(sequenceNumber)
            .removePrefix(PREFIX)

        val isValidAccession = accessionFromNumberService.validateAccession(accessionWithoutPrefix)
        assertThat(isValidAccession, `is`(false))
    }

    @Test
    fun `GIVEN an invalid accession THEN the validation fails`() {
        val invalidAccession = PREFIX + "Not a valid accession"

        val isValidAccession = accessionFromNumberService.validateAccession(invalidAccession)
        assertThat(isValidAccession, `is`(false))
    }
}
