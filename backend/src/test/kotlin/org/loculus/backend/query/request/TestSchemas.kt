package org.loculus.backend.query.request

import org.loculus.backend.config.QueryEngineMetadata
import org.loculus.backend.config.QueryEngineOrganismConfig
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.query.schema.LineageDefinitionReader
import org.loculus.backend.query.schema.QuerySchema
import java.time.LocalDate

object TestSchemas {
    /** 30 nt, position 21 = C (like SARS-CoV-2) */
    const val MAIN_REFERENCE = "ACGTACGTACGTACGTACGTCGGGAAATTT"
    const val GENE_S = "MFVFLVLLPL"
    const val GENE_E = "MYSFVTEETG"

    private val queryEngineConfig = QueryEngineOrganismConfig(
        metadata = listOf(
            QueryEngineMetadata("accessionVersion", "string"),
            QueryEngineMetadata("country", "string", generateIndex = true),
            QueryEngineMetadata("date", "date"),
            QueryEngineMetadata("age", "int"),
            QueryEngineMetadata("qc", "float"),
            QueryEngineMetadata("isRevocation", "boolean"),
            QueryEngineMetadata("pangoLineage", "string", generateIndex = true, lineageSystem = "pango"),
            QueryEngineMetadata("versionStatus", "string"),
        ),
    )

    val lineages = LineageDefinitionReader.read(
        """
        A: {}
        B:
          parents: [A]
        B.1:
          parents: [B]
        B.1.1:
          parents: [B.1]
        B.1.1.7:
          parents: [B.1.1]
        B.1.1.529:
          parents: [B.1.1]
        B.1.1.529.1:
          parents: [B.1.1.529]
          aliases: [BA.1]
        BA.1.1:
          parents: [B.1.1.529.1]
        XA:
          parents: [B.1.1.7, B.1.1.529]
        XA.1:
          parents: [XA]
        """.trimIndent(),
    )

    val single: QuerySchema = QuerySchema.build(
        "single",
        "test",
        queryEngineConfig,
        ReferenceGenome(
            nucleotideSequences = listOf(ReferenceSequence("main", MAIN_REFERENCE)),
            genes = listOf(ReferenceSequence("S", GENE_S), ReferenceSequence("E", GENE_E)),
        ),
        mapOf("pango" to lineages),
    )

    val multi: QuerySchema = QuerySchema.build(
        "multi",
        "test",
        queryEngineConfig,
        ReferenceGenome(
            nucleotideSequences = listOf(ReferenceSequence("L", "ACGTACGTAC"), ReferenceSequence("M", "GGGGCCCC")),
            genes = listOf(ReferenceSequence("GP", "MKV"), ReferenceSequence("NP", "MSTL")),
        ),
        mapOf("pango" to lineages),
    )

    fun epochDay(date: String) = LocalDate.parse(date).toEpochDay().toInt()
}
