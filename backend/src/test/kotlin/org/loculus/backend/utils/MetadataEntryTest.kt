package org.loculus.backend.utils

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.controller.UnprocessableEntityException
import java.io.ByteArrayInputStream
import java.util.UUID

class MetadataEntryTest {
    @Test
    fun `basic TSV test`() {
        val str = """
            submissionId${'\t'}Country
            foo${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = metadataEntryStreamAsSequence(inputStream).toList()
        assertThat(entries, hasSize(1))
        assertThat(entries[0].submissionId, equalTo("foo"))
        assertThat(entries[0].metadata["Country"], equalTo("bar"))
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
        assertThat(exception.message, containsString("whitespace"))
        assertThat(exception.message, containsString("Record #1")) // First data record is #1
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
        assertThat(exception.message, containsString("Record #1"))
        assertThat(exception.message, containsString("contains no value for"))
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
        assertThat(exception.message, containsString("Record #3"))
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
        assertThat(exception.message, containsString("not a valid TSV file"))
        assertThat(exception.message, containsString("Common causes include"))
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
        assertThat(exception.message, containsString("whitespace"))
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
        assertThat(exception.message, containsString("not a valid TSV file"))
        assertThat(exception.message, containsString("Common causes include"))
    }

    @Test
    fun `test multiple fasta IDs are accepted without limit`() {
        val str = """
            submissionId${'\t'}fastaIds${'\t'}Country
            foo${'\t'}seq1 seq2 seq3${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = metadataEntryStreamAsSequence(inputStream).toList()
        assertThat(entries, hasSize(1))
        assertThat(entries[0].submissionId, equalTo("foo"))
        assertThat(entries[0].fastaIds, equalTo(setOf("seq1", "seq2", "seq3")))
    }

    @Test
    fun `test multiple duplicate fasta IDs are all reported`() {
        val str = """
            submissionId${'\t'}fastaIds${'\t'}Country
            foo${'\t'}seq1 seq2 seq1 seq2 seq3${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream).toList()
        }
        assertThat(exception.message, containsString("record #1"))
        assertThat(exception.message, containsString("foo"))
        assertThat(exception.message, containsString("duplicate fasta ids"))
        assertThat(exception.message, containsString("seq1"))
        assertThat(exception.message, containsString("seq2"))
    }

    @Test
    fun `test duplicate detection works`() {
        val str = """
            submissionId${'\t'}fastaIds${'\t'}Country
            foo${'\t'}seq1 seq1${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(inputStream).toList()
        }
        assertThat(exception.message, containsString("duplicate fasta ids"))
        assertThat(exception.message, containsString("seq1"))
    }

    @Test
    fun `test files columns are parsed and excluded from metadata`() {
        val fileId1 = "123e4567-e89b-12d3-a456-426614174000"
        val fileId2 = "223e4567-e89b-12d3-a456-426614174001"
        val str = """
            submissionId${'\t'}files.raw_reads${'\t'}Country
            foo${'\t'}reads_1.fq:$fileId1 reads_2.fq:$fileId2${'\t'}bar
        """.trimIndent()
        val entries = metadataEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        assertThat(entries, hasSize(1))
        assertThat(
            entries[0].files,
            equalTo(
                mapOf(
                    "raw_reads" to listOf(
                        FileIdAndName(UUID.fromString(fileId1), "reads_1.fq"),
                        FileIdAndName(UUID.fromString(fileId2), "reads_2.fq"),
                    ),
                ),
            ),
        )
        // The files.* column must not leak into the metadata map.
        assertThat(entries[0].metadata.containsKey("files.raw_reads"), equalTo(false))
        assertThat(entries[0].metadata["Country"], equalTo("bar"))
    }

    @Test
    fun `test multiple files categories are parsed`() {
        val fileId1 = "123e4567-e89b-12d3-a456-426614174000"
        val fileId2 = "223e4567-e89b-12d3-a456-426614174001"
        val str = """
            submissionId${'\t'}files.raw_reads${'\t'}files.assemblies${'\t'}Country
            foo${'\t'}reads.fq:$fileId1${'\t'}asm.fa:$fileId2${'\t'}bar
        """.trimIndent()
        val entries = metadataEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        assertThat(entries[0].files!!.keys, equalTo(setOf("raw_reads", "assemblies")))
        assertThat(
            entries[0].files!!["raw_reads"],
            equalTo(listOf(FileIdAndName(UUID.fromString(fileId1), "reads.fq"))),
        )
        assertThat(
            entries[0].files!!["assemblies"],
            equalTo(listOf(FileIdAndName(UUID.fromString(fileId2), "asm.fa"))),
        )
    }

    @Test
    fun `test blank files cell omits that category`() {
        val fileId1 = "123e4567-e89b-12d3-a456-426614174000"
        val str = """
            submissionId${'\t'}files.raw_reads${'\t'}files.assemblies${'\t'}Country
            foo${'\t'}reads.fq:$fileId1${'\t'}${'\t'}bar
        """.trimIndent()
        val entries = metadataEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        assertThat(entries[0].files!!.keys, equalTo(setOf("raw_reads")))
    }

    @Test
    fun `test no files columns yields null files`() {
        val str = """
            submissionId${'\t'}Country
            foo${'\t'}bar
        """.trimIndent()
        val entries = metadataEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        assertThat(entries[0].files, nullValue())
    }

    @Test
    fun `test files entry missing file ID is rejected`() {
        val str = """
            submissionId${'\t'}files.raw_reads${'\t'}Country
            foo${'\t'}reads_1.fq${'\t'}bar
        """.trimIndent()
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        }
        assertThat(exception.message, containsString("missing a file ID"))
    }

    @Test
    fun `test files entry missing file name is rejected`() {
        val fileId1 = "123e4567-e89b-12d3-a456-426614174000"
        val str = """
            submissionId${'\t'}files.raw_reads${'\t'}Country
            foo${'\t'}:$fileId1${'\t'}bar
        """.trimIndent()
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        }
        assertThat(exception.message, containsString("missing a file name"))
    }

    @Test
    fun `test files entry with invalid UUID is rejected`() {
        val str = """
            submissionId${'\t'}files.raw_reads${'\t'}Country
            foo${'\t'}reads_1.fq:not-a-uuid${'\t'}bar
        """.trimIndent()
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        }
        assertThat(exception.message, containsString("invalid file ID"))
    }

    @Test
    fun `test duplicate file names within a category are rejected`() {
        val fileId1 = "123e4567-e89b-12d3-a456-426614174000"
        val fileId2 = "223e4567-e89b-12d3-a456-426614174001"
        val str = """
            submissionId${'\t'}files.raw_reads${'\t'}Country
            foo${'\t'}reads.fq:$fileId1 reads.fq:$fileId2${'\t'}bar
        """.trimIndent()
        val exception = assertThrows<UnprocessableEntityException> {
            metadataEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        }
        assertThat(exception.message, containsString("duplicate file names"))
        assertThat(exception.message, containsString("reads.fq"))
    }

    @Test
    fun `test file name containing a colon splits on the last colon`() {
        val fileId1 = "123e4567-e89b-12d3-a456-426614174000"
        val str = """
            submissionId${'\t'}files.raw_reads${'\t'}Country
            foo${'\t'}weird:name.fq:$fileId1${'\t'}bar
        """.trimIndent()
        val entries = metadataEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        assertThat(
            entries[0].files!!["raw_reads"],
            equalTo(listOf(FileIdAndName(UUID.fromString(fileId1), "weird:name.fq"))),
        )
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
        assertThat(entries, hasSize(1))
        assertThat(entries[0].submissionId, equalTo("foo"))
        assertThat(entries[0].accession, equalTo("ACC123"))
        assertThat(entries[0].metadata["Country"], equalTo("bar"))
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
        assertThat(exception.message, containsString("not a valid TSV file"))
        assertThat(exception.message, containsString("Common causes include"))
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
        assertThat(exception.message, containsString("not a valid TSV file"))
        assertThat(exception.message, containsString("Common causes include"))
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
        assertThat(exception.message, containsString("Record #1"))
        assertThat(exception.message, containsString("contains no value for"))
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
        assertThat(exception.message, containsString("Record #1"))
        assertThat(exception.message, containsString("accession"))
    }

    @Test
    fun `test revision multiple fasta IDs are accepted`() {
        val str = """
            submissionId${'\t'}accession${'\t'}fastaIds${'\t'}Country
            foo${'\t'}ACC123${'\t'}seq1 seq2 seq3${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val entries = revisionEntryStreamAsSequence(inputStream).toList()
        assertThat(entries, hasSize(1))
        assertThat(entries[0].submissionId, equalTo("foo"))
        assertThat(entries[0].fastaIds, equalTo(setOf("seq1", "seq2", "seq3")))
    }

    @Test
    fun `test revision duplicate fasta IDs are rejected`() {
        val str = """
            submissionId${'\t'}accession${'\t'}fastaIds${'\t'}Country
            foo${'\t'}ACC123${'\t'}seq1 seq2 seq1${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            revisionEntryStreamAsSequence(inputStream).toList()
        }
        assertThat(exception.message, containsString("record #1"))
        assertThat(exception.message, containsString("foo"))
        assertThat(exception.message, containsString("duplicate fasta ids"))
        assertThat(exception.message, containsString("seq1"))
    }

    @Test
    fun `test revision duplicate detection works`() {
        val str = """
            submissionId${'\t'}accession${'\t'}fastaIds${'\t'}Country
            foo${'\t'}ACC123${'\t'}seq1 seq1${'\t'}bar
        """.trimIndent()
        val inputStream = ByteArrayInputStream(str.toByteArray())
        val exception = assertThrows<UnprocessableEntityException> {
            revisionEntryStreamAsSequence(inputStream).toList()
        }
        assertThat(exception.message, containsString("duplicate fasta ids"))
        assertThat(exception.message, containsString("seq1"))
    }

    @Test
    fun `test revision files column is parsed and excluded from metadata`() {
        val fileId1 = "123e4567-e89b-12d3-a456-426614174000"
        val str = """
            submissionId${'\t'}accession${'\t'}files.raw_reads${'\t'}Country
            foo${'\t'}ACC123${'\t'}reads.fq:$fileId1${'\t'}bar
        """.trimIndent()
        val entries = revisionEntryStreamAsSequence(ByteArrayInputStream(str.toByteArray())).toList()
        assertThat(
            entries[0].files,
            equalTo(mapOf("raw_reads" to listOf(FileIdAndName(UUID.fromString(fileId1), "reads.fq")))),
        )
        assertThat(entries[0].metadata.containsKey("files.raw_reads"), equalTo(false))
    }
}
