package org.loculus.backend.config

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.DEFAULT_ORGANISM

class BackendSpringConfigTest {

    @Test
    fun `GIVEN an empty config THEN the it is valid`() {
        val conf = BackendConfig(
            organisms = mapOf(
                DEFAULT_ORGANISM to InstanceConfig(
                    schema = Schema(
                        DEFAULT_ORGANISM,
                        metadata = emptyList(),
                    ),
                    referenceGenomes = ReferenceGenome(emptyList(), emptyList()),
                ),
            ),
            accessionPrefix = "FOO_",
            dataUseTermsUrls = null,
        )

        val errors = validateEarliestReleaseDateFields(conf)

        assertTrue(errors.isEmpty())
    }

    @Test
    fun `GIVEN a config with two external fields that exist and are of type date THEN it is valid`() {
        val conf = BackendConfig(
            organisms = mapOf(
                DEFAULT_ORGANISM to InstanceConfig(
                    schema = Schema(
                        DEFAULT_ORGANISM,
                        metadata = listOf(
                            Metadata("foo", MetadataType.DATE),
                            Metadata("bar", MetadataType.DATE),
                        ),
                        earliestReleaseDate = EarliestReleaseDate(
                            true,
                            listOf(
                                "foo",
                                "bar",
                            ),
                        ),
                    ),
                    referenceGenomes = ReferenceGenome(emptyList(), emptyList()),
                ),
            ),
            accessionPrefix = "FOO_",
            dataUseTermsUrls = null,
        )
    }
}
