package org.loculus.backend.utils

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.controller.UnprocessableEntityException
import java.io.ByteArrayInputStream

class RevisionEntryTest {
    @Test
    fun `detects missing tabs in revised metadata`() {
        val str = """
            accession submissionId Country
            1 foo bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            revisionEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("No tabs detected"))
    }
}
