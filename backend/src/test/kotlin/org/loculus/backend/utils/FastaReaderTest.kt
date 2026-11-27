package org.loculus.backend.utils

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.errors.UnprocessableEntityException

class FastaReaderTest {

    @Test
    fun `non-empty fasta`() {
        val fasta = """
            >seq1
            AAA
            TTT
            >seq2
            TTT
            CCC
            
            >seq3
            CCCGGG
        """.trimIndent()
        val parsed = FastaReader(fasta.byteInputStream()).toList()
        assert(parsed.size == 3)
        assert(parsed[0].fastaId.equals("seq1"))
        assert(parsed[0].sequence.equals("AAATTT"))
        assert(parsed[1].fastaId.equals("seq2"))
        assert(parsed[1].sequence.equals("TTTCCC"))
        assert(parsed[2].fastaId.equals("seq3"))
        assert(parsed[2].sequence.equals("CCCGGG"))
    }

    @Test
    fun `sample ID parsed correctly with space`() {
        val fasta = """
            >seq1 foo bar
            CCCGGG
        """.trimIndent()
        val parsed = FastaReader(fasta.byteInputStream()).toList()
        assert(parsed[0].fastaId.equals("seq1"))
    }

    @Test
    fun `sample ID parsed correctly with other whitespace`() {
        val fasta = """
            >seq1${'\t'}foo bar
            CCCGGG
        """.trimIndent()
        val parsed = FastaReader(fasta.byteInputStream()).toList()
        assert(parsed[0].fastaId.equals("seq1"))
    }

    @Test
    fun `empty fasta`() {
        val fasta = """
        """.trimIndent()
        val parsed = FastaReader(fasta.byteInputStream()).toList()
        assert(parsed.isEmpty())
    }

    @Test
    fun `sequence with NUL character is rejected`() {
        val fasta = ">seq1\nACGT\u0000ACGT\n"
        val exception = assertThrows<UnprocessableEntityException> {
            FastaReader(fasta.byteInputStream()).toList()
        }
        assertThat(exception.message, containsString("`seq1`"))
        assertThat(exception.message, containsString("U+0000"))
        assertThat(exception.message, containsString("position 5"))
    }

    @Test
    fun `fasta id with NUL character is rejected`() {
        val fasta = ">seq\u00001\nACGT\n"
        val exception = assertThrows<UnprocessableEntityException> {
            FastaReader(fasta.byteInputStream()).toList()
        }
        assertThat(exception.message, containsString("`seq<NUL>1`"))
        assertThat(exception.message, not(containsString("\u0000")))
    }

    @Test
    fun `fasta id longer than 255 characters is rejected`() {
        val fasta = ">${"a".repeat(256)}\nACGT\n"
        val exception = assertThrows<UnprocessableEntityException> {
            FastaReader(fasta.byteInputStream()).toList()
        }
        assertThat(exception.message, containsString("256 characters long"))
    }

    @Test
    fun `fasta id with 255 characters and non-ASCII characters is accepted`() {
        val id = "Zürich_" + "a".repeat(248)
        val parsed = FastaReader(">$id description\nACGT\n".byteInputStream()).toList()
        assertThat(parsed[0].fastaId, equalTo(id))
    }

    @Test
    fun `fasta id length is counted in code points`() {
        // 200 emoji = 400 UTF-16 chars but 200 code points
        val id = "🦠".repeat(200)
        val parsed = FastaReader(">$id\nACGT\n".byteInputStream()).toList()
        assertThat(parsed[0].fastaId, equalTo(id))
    }

    @Test
    fun `binary file content after a FASTA header is rejected`() {
        // Start of a .docx (zip) file, as produced when a Word document is uploaded as a sequence
        val zipHeader = byteArrayOf(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00)
        val fasta = ">seq1\n".toByteArray() + zipHeader + "\n".toByteArray()
        val exception = assertThrows<UnprocessableEntityException> {
            FastaReader(fasta.inputStream()).toList()
        }
        assertThat(exception.message, containsString("binary file"))
    }

    @Test
    fun `non-ASCII character in sequence is rejected`() {
        val fasta = ">seq1\nACGT\uFFFDACGT\n"
        assertThrows<UnprocessableEntityException> {
            FastaReader(fasta.byteInputStream()).toList()
        }
    }

    @Test
    fun `printable ASCII sequence characters are accepted`() {
        val fasta = ">seq1\nACGTNRYKMSWBDHV-acgtn*.?\n"
        val parsed = FastaReader(fasta.byteInputStream()).toList()
        assert(parsed[0].sequence == "ACGTNRYKMSWBDHV-acgtn*.?")
    }

    @Test
    fun `windows line endings are accepted`() {
        val fasta = ">seq1\r\nACGT\r\nACGT\r\n"
        val parsed = FastaReader(fasta.byteInputStream()).toList()
        assert(parsed[0].sequence == "ACGTACGT")
    }
}
