package org.loculus.backend.query.projection

import com.fasterxml.jackson.databind.node.BooleanNode
import com.fasterxml.jackson.databind.node.DoubleNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.LongNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import com.github.luben.zstd.Zstd
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Insertion
import org.loculus.backend.query.schema.Alphabet
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.MutationCode
import org.loculus.backend.query.schema.SequenceSchema
import org.loculus.backend.query.schema.SequenceType

class SequenceAnalysisTest {
    private val nuc = SequenceSchema("main", SequenceType.NUCLEOTIDE, 0, "ACGTACGTAC")
    private val gene = SequenceSchema("S", SequenceType.AMINO_ACID, 3, "MFVFLV*")

    private fun analyze(schema: SequenceSchema, sequence: String): Pair<List<Triple<Int, Int, Char>>, List<Int>> {
        val mutations = IntList()
        val missing = IntList()
        val bytes = sequence.toByteArray()
        SequenceAnalysis.analyzeAligned(schema, bytes, bytes.size, mutations, missing)
        val decoded = mutations.toIntArray().map {
            Triple(
                MutationCode.seqIndex(it),
                MutationCode.position(it),
                schema.alphabet.symbols[MutationCode.symbolIndex(it)],
            )
        }
        return decoded to missing.toIntArray().toList()
    }

    @Test
    fun `reference sequence has no mutations and no missing ranges`() {
        val (mutations, missing) = analyze(nuc, "ACGTACGTAC")
        assertThat(mutations, equalTo(emptyList()))
        assertThat(missing, equalTo(emptyList()))
    }

    @Test
    fun `substitutions, deletions and ambiguity codes are mutations, N runs are missing`() {
        val (mutations, missing) = analyze(nuc, "TCG-NNGYAN")
        assertThat(
            mutations,
            equalTo(listOf(Triple(0, 1, 'T'), Triple(0, 4, '-'), Triple(0, 8, 'Y'))),
        )
        assertThat(missing, equalTo(listOf(0, 5, 7, 0, 10, 11)))
    }

    @Test
    fun `symbols are case insensitive and unknown characters count as missing`() {
        val (mutations, missing) = analyze(nuc, "acgtXcgtAa")
        assertThat(mutations, equalTo(listOf(Triple(0, 10, 'A'))))
        assertThat(missing, equalTo(listOf(0, 5, 6)))
    }

    @Test
    fun `a sequence shorter than the reference is missing at the end`() {
        val (mutations, missing) = analyze(nuc, "ACGTACGN")
        assertThat(mutations, equalTo(emptyList()))
        assertThat(missing, equalTo(listOf(0, 8, 11)))
    }

    @Test
    fun `amino acids use X as missing symbol and keep stop codons and gaps`() {
        val (mutations, missing) = analyze(gene, "MXX-LV*")
        assertThat(mutations, equalTo(listOf(Triple(3, 4, '-'))))
        assertThat(missing, equalTo(listOf(3, 2, 4)))

        val (mutations2, missing2) = analyze(gene, "NFVFLVL")
        assertThat(mutations2, equalTo(listOf(Triple(3, 1, 'N'), Triple(3, 7, 'L'))))
        assertThat(missing2, equalTo(emptyList()))
    }

    @Test
    fun `all missing`() {
        val (mutations, missing) = analyze(nuc, "NNNNNNNNNN")
        assertThat(mutations, equalTo(emptyList()))
        assertThat(missing, equalTo(listOf(0, 1, 11)))
    }

    @Test
    fun `mutation codes use alphabet symbol indices`() {
        val mutations = IntList()
        val bytes = "GCGTACGTAC".toByteArray()
        SequenceAnalysis.analyzeAligned(nuc, bytes, bytes.size, mutations, IntList())
        assertThat(
            mutations.toIntArray().single(),
            equalTo(MutationCode.encode(0, 1, Alphabet.NUCLEOTIDE.indexOf('G'))),
        )
    }

    @Test
    fun `insertions are formatted with sequence index and upper cased`() {
        assertThat(SequenceAnalysis.formatInsertion(4, Insertion(123, "acgT")), equalTo("4:123:ACGT"))
        assertThat(SequenceAnalysis.formatInsertion(12, Insertion(5, "EP*")), equalTo("12:5:EP*"))
    }

    @Test
    fun `decompressor handles frames with and without dictionary`() {
        val dict = "ACGTACGTACGTTTGACCA".repeat(10).toByteArray()
        val sequence = "ACGTACGTACGTTTGACCAN".repeat(50).toByteArray()
        val withDict = Zstd.compressUsingDict(sequence, dict, 3)
        val withoutDict = Zstd.compress(sequence, 3)
        val decompressor = SequenceDecompressor { id -> if (id == 7) dict else error("unknown dict $id") }

        val a = decompressor.decompress(withDict, 7) { buffer, length -> String(buffer, 0, length) }
        val b = decompressor.decompress(withoutDict, null) { buffer, length -> String(buffer, 0, length) }
        assertThat(a, equalTo(String(sequence)))
        assertThat(b, equalTo(String(sequence)))
    }

    @Test
    fun `metadata is normalized to the schema fields and types`() {
        val normalizer = LapisMetadataNormalizer(
            listOf(
                MetadataField("s", FieldType.STRING),
                MetadataField("sNum", FieldType.STRING),
                MetadataField("i", FieldType.INT),
                MetadataField("iText", FieldType.INT),
                MetadataField("f", FieldType.FLOAT),
                MetadataField("d", FieldType.DATE),
                MetadataField("dInvalid", FieldType.DATE),
                MetadataField("dPartial", FieldType.DATE),
                MetadataField("b", FieldType.BOOLEAN),
                MetadataField("missing", FieldType.STRING),
            ),
        )
        val result = normalizer.normalize(
            mapOf(
                "extra" to TextNode("ignored"),
                "b" to BooleanNode.TRUE,
                "s" to TextNode("text"),
                "sNum" to IntNode(5),
                "i" to LongNode(1700000000000),
                "iText" to TextNode("12"),
                "f" to IntNode(3),
                "d" to TextNode("2024-02-29"),
                "dInvalid" to TextNode("2023-02-29"),
                "dPartial" to TextNode("2023-02"),
                "missing" to NullNode.instance,
            ),
        )
        assertThat(
            result.fieldNames().asSequence().toList(),
            equalTo(listOf("s", "sNum", "i", "iText", "f", "d", "dInvalid", "dPartial", "b", "missing")),
        )
        assertThat(result["s"], equalTo(TextNode("text")))
        assertThat(result["sNum"], equalTo(TextNode("5")))
        assertThat(result["i"], equalTo(LongNode(1700000000000)))
        assertThat(result["iText"], equalTo(LongNode(12)))
        assertThat(result["f"], equalTo(DoubleNode(3.0)))
        assertThat(result["d"], equalTo(TextNode("2024-02-29")))
        assertThat(result["dInvalid"].isNull, equalTo(true))
        assertThat(result["dPartial"].isNull, equalTo(true))
        assertThat(result["b"], equalTo(BooleanNode.TRUE))
        assertThat(result["missing"].isNull, equalTo(true))
    }

    @Test
    fun `csv helpers escape quotes and write postgres literals`() {
        assertThat(ProjectionWriter.appendCsvText(StringBuilder(), "a\"b").toString(), equalTo("\"a\"\"b\""))
        assertThat(
            ProjectionWriter.appendIntArray(StringBuilder(), intArrayOf(1, -2)).toString(),
            equalTo("\"{1,-2}\""),
        )
        assertThat(
            ProjectionWriter.appendTextArray(StringBuilder(), listOf("0:1:A", "x\"y")).toString(),
            equalTo("\"{\"\"0:1:A\"\",\"\"x\\\"\"y\"\"}\""),
        )
        assertThat(ProjectionWriter.appendHex(StringBuilder(), byteArrayOf(0, 15, -1)).toString(), equalTo("\\x000fff"))
    }
}
