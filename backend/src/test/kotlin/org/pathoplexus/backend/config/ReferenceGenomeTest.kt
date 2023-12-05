package org.pathoplexus.backend.config

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class ReferenceGenomeTest {
    @Test
    fun `GIVEN single nucleotide segment is not called main THEN throws exception`() {
        val exception =
            assertThrows<IllegalArgumentException> {
                ReferenceGenome(
                    listOf(
                        ReferenceSequence(
                            name = "not main",
                            sequence = "does not matter",
                        ),
                    ),
                    emptyList(),
                )
            }

        assertThat(exception.message, containsString("must be named 'main'"))
    }
}
