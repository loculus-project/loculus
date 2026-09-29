package org.loculus.backend.query.request

import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SiloConfigReader
import org.loculus.backend.query.schema.SiloDatabaseConfig
import org.loculus.backend.query.schema.SiloFeature
import org.loculus.backend.query.schema.SiloMetadata
import org.loculus.backend.query.schema.SiloSchema
import java.time.LocalDate

object TestSchemas {
    /** 30 nt, position 21 = C (like SARS-CoV-2) */
    const val MAIN_REFERENCE = "ACGTACGTACGTACGTACGTCGGGAAATTT"
    const val GENE_S = "MFVFLVLLPL"
    const val GENE_E = "MYSFVTEETG"

    private val databaseConfig = SiloDatabaseConfig(
        SiloSchema(
            instanceName = "test",
            primaryKey = "accessionVersion",
            metadata = listOf(
                SiloMetadata("accessionVersion", "string", generateIndex = false),
                SiloMetadata("country", "string", generateIndex = true),
                SiloMetadata("date", "date"),
                SiloMetadata("age", "int"),
                SiloMetadata("qc", "float"),
                SiloMetadata("isRevocation", "boolean"),
                SiloMetadata("pangoLineage", "string", generateIndex = true, generateLineageIndex = "pango"),
                SiloMetadata("versionStatus", "string"),
            ),
            features = listOf(SiloFeature("generalizedAdvancedQuery")),
        ),
    )

    val lineages = SiloConfigReader.readLineageDefinition(
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
        databaseConfig,
        ReferenceGenome(
            nucleotideSequences = listOf(ReferenceSequence("main", MAIN_REFERENCE)),
            genes = listOf(ReferenceSequence("S", GENE_S), ReferenceSequence("E", GENE_E)),
        ),
        mapOf("pango" to lineages),
    )

    val multi: QuerySchema = QuerySchema.build(
        "multi",
        databaseConfig,
        ReferenceGenome(
            nucleotideSequences = listOf(ReferenceSequence("L", "ACGTACGTAC"), ReferenceSequence("M", "GGGGCCCC")),
            genes = listOf(ReferenceSequence("GP", "MKV"), ReferenceSequence("NP", "MSTL")),
        ),
        mapOf("pango" to lineages),
    )

    fun epochDay(date: String) = LocalDate.parse(date).toEpochDay().toInt()
}
