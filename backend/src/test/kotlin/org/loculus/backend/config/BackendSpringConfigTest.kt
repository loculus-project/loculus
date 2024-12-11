package org.loculus.backend.config

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.DEFAULT_ORGANISM

class BackendSpringConfigTest {

    @Test
    fun `GIVEN an empty config THEN the it is valid`() {
        val conf = backendConfig(emptyList(), EarliestReleaseDate(false, emptyList()))

        val errors = validateEarliestReleaseDateFields(conf)

        assertTrue(errors.isEmpty())
    }

    @Test
    fun `GIVEN a config with two external fields that exist and are of type date THEN it is valid`() {
        val conf = backendConfig(
            listOf(
                Metadata("foo", MetadataType.DATE),
                Metadata("bar", MetadataType.DATE),
            ),
            EarliestReleaseDate(
                true,
                listOf(
                    "foo",
                    "bar",
                ),
            ),
        )

        val errors = validateEarliestReleaseDateFields(conf)

        assertTrue(errors.isEmpty())
    }

    @Test
    fun `GIVEN a config with a missing external field THEN it is invalid`() {
        val conf = backendConfig(
            listOf(
                Metadata("foo", MetadataType.DATE),
            ),
            EarliestReleaseDate(
                true,
                listOf(
                    "foo",
                    "bar",
                ),
            ),
        )

        val errors = validateEarliestReleaseDateFields(conf)

        assertThat(errors.size, `is`(1))
    }

    @Test
    fun `GIVEN a config with an external field with incorrect type THEN it is invalid`() {
        val conf = backendConfig(
            listOf(
                Metadata("foo", MetadataType.DATE),
                Metadata("bar", MetadataType.STRING),
            ),
            EarliestReleaseDate(
                true,
                listOf(
                    "foo",
                    "bar",
                ),
            ),
        )

        val errors = validateEarliestReleaseDateFields(conf)

        assertThat(errors.size, `is`(1))
    }
}

fun backendConfig(metadataList: List<Metadata>, earliestReleaseDate: EarliestReleaseDate) = BackendConfig(
    organisms = mapOf(
        DEFAULT_ORGANISM to InstanceConfig(
            Schema(DEFAULT_ORGANISM, metadataList, earliestReleaseDate = earliestReleaseDate),
            ReferenceGenome(emptyList(), emptyList()),
        ),
    ),
    accessionPrefix = "FOO_",
    dataUseTermsUrls = null,
)
