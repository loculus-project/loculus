package org.loculus.backend.utils

import org.junit.jupiter.api.Test

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
        assert(parsed[0].sampleName.equals("seq1"))
        assert(parsed[0].sequence.equals("AAATTT"))
        assert(parsed[1].sampleName.equals("seq2"))
        assert(parsed[1].sequence.equals("TTTCCC"))
        assert(parsed[2].sampleName.equals("seq3"))
        assert(parsed[2].sequence.equals("CCCGGG"))
    }

    @Test
    fun `empty fasta`() {
        val fasta = """
        """.trimIndent()
        val parsed = FastaReader(fasta.byteInputStream()).toList()
        assert(parsed.isEmpty())
    }
}
