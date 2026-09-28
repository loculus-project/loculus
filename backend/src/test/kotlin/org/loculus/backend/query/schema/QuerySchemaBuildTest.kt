package org.loculus.backend.query.schema

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.QueryEngineMetadata
import org.loculus.backend.config.QueryEngineOrganismConfig
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.config.readBackendConfig
import org.loculus.backend.query.QuerySchemaRegistry

class QuerySchemaBuildTest {
    /** Spring Boot's ObjectMapper ignores unknown properties, as the backend relies on for its config */
    private fun springLikeMapper() =
        jacksonObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    private val genome = ReferenceGenome(listOf(ReferenceSequence("main", "ACGT")), emptyList())

    /** an organism's `queryEngine` section as `_queryEngineSchema.tpl` renders it (trimmed west-nile + mpox) */
    private val rendered = """
        {
          "metadata": [
            {"name": "accessionVersion", "type": "string"},
            {"name": "version", "type": "int"},
            {"name": "submitter", "type": "string", "generateIndex": true},
            {"name": "releasedAtTimestamp", "type": "timestamp"},
            {"name": "authors", "type": "authors"},
            {"name": "sampleCollectionDate", "type": "date"},
            {"name": "hostTaxonId", "type": "string", "generateIndex": true,
             "hierarchicalFilter": "http://loculus-taxonomy-service:5000"},
            {"name": "outbreakLineage", "type": "string", "generateIndex": true, "lineageSystem": "mpoxOutbreakLineage"},
            {"name": "raw_reads", "type": "string"}
          ],
          "lineageSystems": {"mpoxOutbreakLineage": {"27": "https://example.org/27.yaml", "28": "https://example.org/28.yaml"}}
        }
    """.trimIndent()

    @Test
    fun `parses the rendered config`() {
        val config = jacksonObjectMapper().readValue<QueryEngineOrganismConfig>(rendered)
        assertThat(config.lineageSystems["mpoxOutbreakLineage"]!![28], equalTo("https://example.org/28.yaml"))
        assertThat(config.metadata[6].hierarchicalFilter, equalTo("http://loculus-taxonomy-service:5000"))
        val withoutSystems = jacksonObjectMapper().readValue<QueryEngineOrganismConfig>("""{"metadata": []}""")
        assertThat(withoutSystems.lineageSystems.entries, empty())
    }

    @Test
    fun `builds fields with SILO column types and lineage systems`() {
        val config = jacksonObjectMapper().readValue<QueryEngineOrganismConfig>(rendered)
        val schema = QuerySchema.build("mpox", "Mpox", config, genome)

        assertThat(schema.instanceName, equalTo("Mpox"))
        assertThat(schema.primaryKey, equalTo("accessionVersion"))
        assertThat(schema.features, equalTo(setOf("generalizedAdvancedQuery")))
        assertThat(schema.metadata.map { it.name }, equalTo(config.metadata.map { it.name }))
        assertThat(schema.field("releasedAtTimestamp")!!.type, equalTo(FieldType.INT))
        assertThat(schema.field("authors")!!.type, equalTo(FieldType.STRING))
        assertThat(schema.field("sampleCollectionDate")!!.type, equalTo(FieldType.DATE))
        assertThat(schema.field("submitter")!!.generateIndex, equalTo(true))
        assertThat(schema.field("version")!!.generateIndex, equalTo(false))

        val host = schema.field("hostTaxonId")!!
        assertThat(host.lineageSystem, equalTo("hostTaxonId"))
        assertThat(host.hierarchicalFilter, equalTo("http://loculus-taxonomy-service:5000"))
        assertThat(host.generateIndex, equalTo(true))

        val lineage = schema.field("outbreakLineage")!!
        assertThat(lineage.lineageSystem, equalTo("mpoxOutbreakLineage"))
        assertThat(lineage.hierarchicalFilter, nullValue())

        // both systems exist from the start, empty until loaded, then replaceable
        assertThat(schema.lineageDefinition("hostTaxonId")!!.nodes.keys, empty())
        assertThat(schema.lineageDefinition("mpoxOutbreakLineage")!!.nodes.keys, empty())
        assertThat(schema.lineageDefinition("country"), nullValue())
        schema.updateLineageDefinition(
            "hostTaxonId",
            LineageDefinitionReader.read("""{"1": {}, "9606": {"parents": ["1"]}}"""),
        )
        assertThat(schema.lineageDefinition("hostTaxonId")!!.resolve("1", true), equalTo(setOf("1", "9606")))
    }

    @Test
    fun `rejects configs the engine cannot serve`() {
        fun build(vararg fields: QueryEngineMetadata) =
            QuerySchema.build("o", "o", QueryEngineOrganismConfig(fields.toList()), genome)
        assertThat(
            assertThrows<IllegalArgumentException> {
                build(QueryEngineMetadata("accessionVersion"), QueryEngineMetadata("accessionVersion"))
            }.message,
            containsString("Duplicate"),
        )
        assertThat(
            assertThrows<IllegalArgumentException> { build(QueryEngineMetadata("x")) }.message,
            containsString("accessionVersion"),
        )
        assertThat(
            assertThrows<IllegalArgumentException> {
                build(QueryEngineMetadata("accessionVersion"), QueryEngineMetadata("x", "json"))
            }.message,
            containsString("json"),
        )
    }

    @Test
    fun `the registry serves the organisms that have a queryEngine section`() {
        val backendConfig = readBackendConfig(springLikeMapper(), "src/test/resources/backend_config.json")
        val registry = QuerySchemaRegistry(backendConfig)
        assertThat(registry.schemas.keys, equalTo(setOf("dummyOrganism", "otherOrganism")))
        assertThat(backendConfig.organisms["dummyOrganismWithoutConsensusSequences"]!!.queryEngine, nullValue())
        assertThat(registry.notQueryable, equalTo(listOf("dummyOrganismWithoutConsensusSequences")))
        val dummy = registry.get("dummyOrganism")!!
        assertThat(dummy.field("submittedAtTimestamp")!!.type, equalTo(FieldType.INT))
        assertThat(dummy.nucleotideSequences.map { it.name }, equalTo(listOf("main")))
        assertThat(registry.lineageSystemUrls["dummyOrganism"], notNullValue())
    }

    @Test
    fun `an organism with more sequences than mutation codes can encode fails alone`() {
        val backendConfig = readBackendConfig(springLikeMapper(), "src/test/resources/backend_config.json")
        val other = backendConfig.organisms.getValue("otherOrganism")
        val genes = (0 until MutationCode.MAX_SEQUENCES).map { ReferenceSequence("gene$it", "M*") }
        val tooMany = other.copy(referenceGenome = other.referenceGenome.copy(genes = genes))
        val organisms = backendConfig.organisms + ("otherOrganism" to tooMany)
        val registry = QuerySchemaRegistry(backendConfig.copy(organisms = organisms))
        assertThat(registry.schemas.keys, equalTo(setOf("dummyOrganism")))
        assertThat(
            registry.notQueryable.toSet(),
            equalTo(setOf("otherOrganism", "dummyOrganismWithoutConsensusSequences")),
        )
        assertThrows<IllegalArgumentException> {
            QuerySchema.build("o", "o", tooMany.queryEngine!!, tooMany.referenceGenome)
        }
    }

    @Test
    fun `other consumers of InstanceConfig are unaffected`() {
        val backendConfig = readBackendConfig(springLikeMapper(), "src/test/resources/backend_config.json")
        val (schema, referenceGenome) = backendConfig.organisms.getValue("dummyOrganism")
        assertThat(schema.metadata.map { it.name }.contains("accessionVersion"), equalTo(false))
        assertThat(referenceGenome.nucleotideSequences.size, equalTo(1))
        assertThat(InstanceConfig(schema, referenceGenome).queryEngine, nullValue())
    }
}
