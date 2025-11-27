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
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("whitespace"))
        assert(exception.message!!.contains("Record #1")) // First data record is #1
    }

    @Test
    fun `test record numbers are included in error messages for missing submission ID`() {
        val str = """
            submissionId${'\t'}Country
            ${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("Record #1"))
        assert(exception.message!!.contains("contains no value for"))
    }

    @Test
    fun `test record numbers are correct for multiple rows`() {
        val str = """
            submissionId${'\t'}Country
            foo1${'\t'}bar
            foo2${'\t'}bar
            ${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream).toList()
        }
        // The error should occur on record #3 (foo1=1, foo2=2, empty=3)
        assert(exception.message!!.contains("Record #3"))
    }

    @Test
    fun `test malformed TSV with quoted fields and spaces throws UnprocessableEntityException`() {
        // This simulates the issue where quoted fields are separated by spaces instead of tabs
        val str =
            "\"id\"${'\t'}\"sampleCollectionDate\"${'\t'}\"geoLocCountry\"${'\t'}${'\t'}${'\t'}" +
                "\"Host\"  \"authors\"\n" +
                "123${'\t'}2025-01-01${'\t'}Switzerland  Homo Sapiens  Potter, H;\n"
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("not a valid TSV file"))
        assert(exception.message!!.contains("Common causes include"))
    }

    @Test
    fun `test malformed TSV with mixed delimiters throws UnprocessableEntityException`() {
        // Another malformed case: using spaces instead of tabs in data rows
        val str = """
            submissionId${'\t'}Country${'\t'}Date
            foo bar${'\t'}Switzerland
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        // This should fail validation because of spaces in the submission ID
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("whitespace"))
    }

    @Test
    fun `test malformed TSV with error during iteration throws UnprocessableEntityException`() {
        // Create a large TSV with many valid rows followed by a malformed row
        // This tests that errors during iteration (not just initialization) are caught
        val headerLine = "\"id\"${'\t'}\"Country\"${'\t'}\"Date\"\n"
        val validRows = (1..1000).joinToString("") { i ->
            "$i${'\t'}Switzerland${'\t'}2025-01-01\n"
        }
        // Malformed row with quoted fields separated by spaces instead of tabs
        val malformedRow = "1001${'\t'}\"Country\"  \"Date\"\n"

        val str = headerLine + validRows + malformedRow
        val inputStream = ByteArrayInputStream(str.toByteArray())

        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("not a valid TSV file"))
        assert(exception.message!!.contains("Common causes include"))
    }

    @Test
    fun `test maxSequencesPerEntry not set allows multiple sequences`() {
        val str = """
            submissionId${'\t'}fastaId${'\t'}Country
            foo${'\t'}seq1 seq2 seq3${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = metadataEntryStreamAsSequence(inputStream, maxSequencesPerEntry = null).toList()
        assert(entries.size == 1)
        assert(entries[0].submissionId == "foo")
        assert(entries[0].fastaIds == listOf("seq1", "seq2", "seq3"))
    }

    @Test
    fun `test maxSequencesPerEntry allows sequences within limit`() {
        val str = """
            submissionId${'\t'}fastaId${'\t'}Country
            foo${'\t'}seq1 seq2${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = metadataEntryStreamAsSequence(inputStream, maxSequencesPerEntry = 3).toList()
        assert(entries.size == 1)
        assert(entries[0].submissionId == "foo")
        assert(entries[0].fastaIds == listOf("seq1", "seq2"))
    }

    @Test
    fun `test maxSequencesPerEntry allows sequences at exact limit`() {
        val str = """
            submissionId${'\t'}fastaId${'\t'}Country
            foo${'\t'}seq1 seq2 seq3${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = metadataEntryStreamAsSequence(inputStream, maxSequencesPerEntry = 3).toList()
        assert(entries.size == 1)
        assert(entries[0].submissionId == "foo")
        assert(entries[0].fastaIds == listOf("seq1", "seq2", "seq3"))
    }

    @Test
    fun `test maxSequencesPerEntry rejects sequences exceeding limit`() {
        val str = """
            submissionId${'\t'}fastaId${'\t'}Country
            foo${'\t'}seq1 seq2 seq3 seq4${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream, maxSequencesPerEntry = 3).toList()
        }
        assert(exception.message!!.contains("record #1"))
        assert(exception.message!!.contains("foo"))
        assert(exception.message!!.contains("found 4 fasta ids"))
        assert(exception.message!!.contains("maximum allowed number of sequences per entry is 3"))
    }

    @Test
    fun `test maxSequencesPerEntry with single sequence limit`() {
        val str = """
            submissionId${'\t'}fastaId${'\t'}Country
            foo${'\t'}seq1 seq2${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream, maxSequencesPerEntry = 1).toList()
        }
        assert(exception.message!!.contains("record #1"))
        assert(exception.message!!.contains("foo"))
        assert(exception.message!!.contains("found 2 fasta ids"))
        assert(exception.message!!.contains("maximum allowed number of sequences per entry is 1"))
    }

    @Test
    fun `test maxSequencesPerEntry allows single sequence when limit is 1`() {
        val str = """
            submissionId${'\t'}fastaId${'\t'}Country
            foo${'\t'}seq1${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = metadataEntryStreamAsSequence(inputStream, maxSequencesPerEntry = 1).toList()
        assert(entries.size == 1)
        assert(entries[0].submissionId == "foo")
        assert(entries[0].fastaIds == listOf("seq1"))
    }

    @Test
    fun `test maxSequencesPerEntry correct record number for multiple rows`() {
        val str = """
            submissionId${'\t'}fastaId${'\t'}Country
            foo1${'\t'}seq1${'\t'}bar
            foo2${'\t'}seq2 seq3${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream, maxSequencesPerEntry = 1).toList()
        }
        assert(exception.message!!.contains("record #2"))
        assert(exception.message!!.contains("foo2"))
    }
}

class RevisionEntryTest {
    @Test
    fun `basic revision TSV test`() {
        val str = """
            submissionId${'\t'}accession${'\t'}Country
            foo${'\t'}ACC123${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = revisionEntryStreamAsSequence(inputStream).toList()
        assert(entries.size == 1)
        assert(entries[0].submissionId == "foo")
        assert(entries[0].accession == "ACC123")
        assert(entries[0].metadata["Country"] == "bar")
    }

    @Test
    fun `revision entry requires accession header`() {
        val str = """
            submissionId${'\t'}Country
            foo${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        assertThrows<UnprocessableEntityException> { revisionEntryStreamAsSequence(inputStream).toList() }
    }

    @Test
    fun `test malformed revision TSV with quoted fields and spaces throws UnprocessableEntityException`() {
        // This simulates the issue where quoted fields are separated by spaces instead of tabs
        val str =
            "\"id\"${'\t'}\"accession\"${'\t'}\"sampleCollectionDate\"${'\t'}${'\t'}${'\t'}" +
                "\"Host\"  \"authors\"\n" +
                "123${'\t'}ACC123${'\t'}2025-01-01${'\t'}Switzerland  Homo Sapiens  Potter, H;\n"
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            revisionEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("not a valid TSV file"))
        assert(exception.message!!.contains("Common causes include"))
    }

    @Test
    fun `test malformed revision TSV with error during iteration throws UnprocessableEntityException`() {
        // Create a large TSV with many valid rows followed by a malformed row
        // This tests that errors during iteration (not just initialization) are caught
        val headerLine = "\"id\"${'\t'}\"accession\"${'\t'}\"Country\"${'\t'}\"Date\"\n"
        val validRows = (1..1000).joinToString("") { i ->
            "$i${'\t'}ACC$i${'\t'}Switzerland${'\t'}2025-01-01\n"
        }
        // Malformed row with quoted fields separated by spaces instead of tabs
        val malformedRow = "1001${'\t'}ACC1001${'\t'}\"Country\"  \"Date\"\n"

        val str = headerLine + validRows + malformedRow
        val inputStream = ByteArrayInputStream(str.toByteArray())

        val exception = assertThrows<UnprocessableEntityException> {
            revisionEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("not a valid TSV file"))
        assert(exception.message!!.contains("Common causes include"))
    }

    @Test
    fun `test record numbers are included in revision error messages`() {
        val str = """
            submissionId${'\t'}accession${'\t'}Country
            ${'\t'}ACC123${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            revisionEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("Record #1"))
        assert(exception.message!!.contains("contains no value for"))
    }

    @Test
    fun `test record numbers for missing accession in revision`() {
        val str = """
            submissionId${'\t'}accession${'\t'}Country
            foo${'\t'}${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            revisionEntryStreamAsSequence(inputStream).toList()
        }
        assert(exception.message!!.contains("Record #1"))
        assert(exception.message!!.contains("accession"))
    }

    @Test
    fun `test revision maxSequencesPerEntry allows sequences within limit`() {
        val str = """
            submissionId${'\t'}accession${'\t'}fastaId${'\t'}Country
            foo${'\t'}ACC123${'\t'}seq1 seq2${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = revisionEntryStreamAsSequence(inputStream, maxSequencesPerEntry = 3).toList()
        assert(entries.size == 1)
        assert(entries[0].submissionId == "foo")
        assert(entries[0].fastaIds == listOf("seq1", "seq2"))
    }

    @Test
    fun `test revision maxSequencesPerEntry rejects sequences exceeding limit`() {
        val str = """
            submissionId${'\t'}accession${'\t'}fastaId${'\t'}Country
            foo${'\t'}ACC123${'\t'}seq1 seq2 seq3${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            revisionEntryStreamAsSequence(inputStream, maxSequencesPerEntry = 2).toList()
        }
        assert(exception.message!!.contains("record #1"))
        assert(exception.message!!.contains("foo"))
        assert(exception.message!!.contains("found 3 fasta ids"))
        assert(exception.message!!.contains("maximum allowed number of sequences per entry is 2"))
    }

    @Test
    fun `test revision maxSequencesPerEntry with single sequence limit`() {
        val str = """
            submissionId${'\t'}accession${'\t'}fastaId${'\t'}Country
            foo${'\t'}ACC123${'\t'}seq1${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = revisionEntryStreamAsSequence(inputStream, maxSequencesPerEntry = 1).toList()
        assert(entries.size == 1)
        assert(entries[0].submissionId == "foo")
        assert(entries[0].fastaIds == listOf("seq1"))
    }
}
