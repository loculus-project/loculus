package org.loculus.backend.utils

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.controller.UnprocessableEntityException
import java.io.ByteArrayInputStream

class MetadataEntryTest {
    @Test
    fun `basic TSV test`() {
        val str = """
            submissionId${'\t'}Country
            foo${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = metadataEntryStreamAsSequence(inputStream).toList()
        assert(entries.size == 1)
        assert(entries[0].submissionId == "foo")
        assert(entries[0].metadata["Country"] == "bar")
    }

    @Test
    fun `submission ID required`() {
        val str = """
            Country
            Bahamas
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        assertThrows<UnprocessableEntityException> { metadataEntryStreamAsSequence(inputStream).toList() }
    }

    @Test
    fun `test no spaces in submission ID`() {
        val str = """
            submissionId${'\t'}Country
            foo with spaces${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        assertThrows<UnprocessableEntityException> { metadataEntryStreamAsSequence(inputStream).toList() }
    }

    @Test
    fun `detects missing tabs`() {
        val str = """
            submissionId Country
            foo bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("No tabs detected"))
    }
}
