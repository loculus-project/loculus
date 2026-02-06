package org.loculus.backend.utils

import org.junit.jupiter.api.Test
import java.io.ByteArrayOutputStream

class FastaWriterTest {

    @Test
    fun `write multiple entries`() {
        val outputStream = ByteArrayOutputStream()
        FastaWriter(outputStream).use { writer ->
            writer.write(FastaEntry("seq1", "AAATTT"))
            writer.write(FastaEntry("seq2", "TTTCCC"))
            writer.write(FastaEntry("seq3", "CCCGGG"))
        }

        val result = outputStream.toString()
        val expected = """
            >seq1
            AAATTT
            >seq2
            TTTCCC
            >seq3
            CCCGGG
        """.trimIndent() + "\n"

        assert(result == expected)
    }

    @Test
    fun `write single entry`() {
        val outputStream = ByteArrayOutputStream()
        FastaWriter(outputStream).use { writer ->
            writer.write(FastaEntry("seq1", "AAATTT"))
        }

        val result = outputStream.toString()
        val expected = """
            >seq1
            AAATTT
        """.trimIndent() + "\n"

        assert(result == expected)
    }

    @Test
    fun `write empty entries`() {
        val outputStream = ByteArrayOutputStream()
        FastaWriter(outputStream).use { writer ->
            writer.writeAll(emptyList())
        }

        val result = outputStream.toString()
        assert(result.isEmpty())
    }

    @Test
    fun `writeAll writes multiple entries`() {
        val outputStream = ByteArrayOutputStream()
        FastaWriter(outputStream).use { writer ->
            writer.writeAll(
                listOf(
                    FastaEntry("seq1", "AAATTT"),
                    FastaEntry("seq2", "TTTCCC"),
                ),
            )
        }

        val result = outputStream.toString()
        val expected = """
            >seq1
            AAATTT
            >seq2
            TTTCCC
        """.trimIndent() + "\n"

        assert(result == expected)
    }

    @Test
    fun `round-trip with FastaReader`() {
        val entries = listOf(
            FastaEntry("seq1", "AAATTT"),
            FastaEntry("seq2", "TTTCCC"),
            FastaEntry("seq3", "CCCGGG"),
        )

        val outputStream = ByteArrayOutputStream()
        FastaWriter(outputStream).use { writer ->
            writer.writeAll(entries)
        }

        val parsed = FastaReader(outputStream.toByteArray().inputStream()).toList()

        assert(parsed.size == entries.size)
        for (i in entries.indices) {
            assert(parsed[i].fastaId == entries[i].fastaId)
            assert(parsed[i].sequence == entries[i].sequence)
        }
    }

    @Test
    fun `handles special characters in fasta id`() {
        val outputStream = ByteArrayOutputStream()
        FastaWriter(outputStream).use { writer ->
            writer.write(FastaEntry("seq1|segment_L", "AAATTT"))
        }

        val result = outputStream.toString()
        assert(result.contains(">seq1|segment_L"))

        val parsed = FastaReader(result.byteInputStream()).toList()
        assert(parsed[0].fastaId == "seq1|segment_L")
    }
}
