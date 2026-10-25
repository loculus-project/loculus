package org.loculus.backend.api

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.controller.UnprocessableEntityException

class SubmissionTypesTest {
    @Test
    fun `GIVEN valid accession version string THEN parses accession and version`() {
        assertThat(AccessionVersion.fromString("LOC_123.42"), `is`(AccessionVersion("LOC_123", 42)))
    }

    @Test
    fun `GIVEN accession version with invalid format THEN throws format exception`() {
        listOf("LOC_123", ".1", "LOC_123.", "LOC.123.1").forEach {
            assertThrows<UnprocessableEntityException> {
                AccessionVersion.fromString(it)
            }
        }
    }

    @Test
    fun `GIVEN non-numeric version THEN throws version exception`() {
        val exception = assertThrows<UnprocessableEntityException> {
            AccessionVersion.fromString("LOC_123.invalid")
        }

        assertThat(
            exception.message,
            `is`("Invalid version in accession version 'LOC_123.invalid', expected a number"),
        )
    }
}
