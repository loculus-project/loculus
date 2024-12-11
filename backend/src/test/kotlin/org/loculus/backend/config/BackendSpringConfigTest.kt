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
}
