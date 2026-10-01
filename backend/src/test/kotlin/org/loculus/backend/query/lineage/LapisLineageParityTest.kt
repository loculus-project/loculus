package org.loculus.backend.query.lineage

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import org.loculus.backend.config.QueryEngineMetadata
import org.loculus.backend.config.QueryEngineOrganismConfig
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.query.index.InMemoryOrganismIndex
import org.loculus.backend.query.index.IndexRow
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.index.OrganismIndexProvider
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.LapisRequestParser
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.schema.QuerySchema
import java.io.File

/**
 * Host (hierarchical) and lineage filters against Pathoplexus production LAPIS. The fixtures in
 * `src/test/resources/lapis-parity/` were taken from lapis.pathoplexus.org on 2026-09-28: each field's
 * `/sample/lineageDefinition/<field>` and `/sample/aggregated?fields=<field>`. The index here holds exactly those
 * value counts; the expected counts are what production LAPIS answered for the same filter at the same time.
 */
class LapisLineageParityTest {
    private data class ValueCount(val value: String?, val count: Int)

    private class Organism(val schema: QuerySchema, val index: InMemoryOrganismIndex, val field: String) {
        fun count(value: String): Int {
            val request = LapisRequestParser.parse(
                schema,
                Endpoint.AGGREGATED,
                null,
                mapOf(field to listOf(value)),
                isGet = true,
            )
            return index.evaluate(request.filter).cardinality
        }
    }

    private fun resource(name: String) = File("src/test/resources/lapis-parity/$name").readText()

    private fun organism(organism: String, field: String, hierarchical: Boolean): Organism {
        val fieldConfig = if (hierarchical) {
            QueryEngineMetadata(field, hierarchicalFilter = TAXONOMY_SERVICE)
        } else {
            QueryEngineMetadata(field, lineageSystem = "system")
        }
        val schema = QuerySchema.build(
            organism,
            organism,
            QueryEngineOrganismConfig(listOf(QueryEngineMetadata("accessionVersion"), fieldConfig)),
            ReferenceGenome(listOf(ReferenceSequence("main", "ACGT")), emptyList()),
        )
        val counts = jacksonObjectMapper().readValue<List<ValueCount>>(resource("$organism-$field-counts.json"))
        val values = counts.flatMap { (value, count) -> List(count) { value } }
        val rows = values.mapIndexed { id, value ->
            IndexRow.of(schema, id, mapOf("accessionVersion" to "LOC_$id.1", field to value))
        }
        val index = InMemoryOrganismIndex.build(schema, rows, dataVersion = 1)

        val definition = resource("$organism-$field-lineageDefinition.json")
        val posted = mutableListOf<Pair<String, List<String>>>()
        val source = object : LineageSource {
            override fun download(url: String): String {
                assertThat("the highest pipeline version's file", url, equalTo("https://example.org/28.yaml"))
                return definition
            }

            override fun hierarchy(serviceUrl: String, values: List<String>): String {
                posted += serviceUrl to values
                return definition
            }
        }
        val provider = object : OrganismIndexProvider {
            override fun get(organism: String): OrganismIndex = index
        }
        val urls = mapOf("system" to mapOf(27 to "https://example.org/27.yaml", 28 to "https://example.org/28.yaml"))
        LineageDefinitions(mapOf(organism to schema), mapOf(organism to urls), provider, source).refresh()

        if (hierarchical) {
            // the SILO importer posts the sorted distinct non-null values too
            val observed = counts.mapNotNull { it.value }.toSortedSet().toList()
            assertThat(posted, equalTo(listOf(TAXONOMY_SERVICE to observed)))
        }
        return Organism(schema, index, field)
    }

    private val organisms by lazy {
        mapOf(
            "marburg" to organism("marburg", "hostTaxonId", hierarchical = true),
            "andv" to organism("andv", "hostTaxonId", hierarchical = true),
            "mpox-host" to organism("mpox", "hostTaxonId", hierarchical = true),
            "mpox-lineage" to organism("mpox", "outbreakLineage", hierarchical = false),
        )
    }

    @ParameterizedTest(name = "{0}: {1} -> {2}")
    @CsvSource(
        delimiter = '|',
        value = [
            // exact taxon, with and without descendants; 9606 is a leaf
            "marburg | 9606 | 160",
            "marburg | 9606* | 160",
            "marburg | 9397 | 24",
            // bats: 9397 itself plus Rousettus aegyptiacus and Hipposideros caffer
            "marburg | 9397* | 261",
            "marburg | 9989* | 7",
            "marburg | 9443* | 160",
            "marburg | 40674* | 428",
            // the root: every entry with a host
            "marburg | 1* | 428",
            // an alias instead of the taxon id
            "marburg | Chiroptera; bats [Taxon 9397]* | 261",
            "andv | 9606 | 261",
            "andv | 9606* | 261",
            // an ancestor that no entry carries itself
            "andv | 9397 | 0",
            "andv | 9397* | 3",
            "andv | 9989* | 186",
            "andv | 9443* | 261",
            "andv | 40674* | 450",
            "andv | 1* | 450",
            "andv | Chiroptera; bats [Taxon 9397]* | 3",
            "mpox-host | 9606* | 14530",
            "mpox-host | 9989* | 14",
            "mpox-host | 9443* | 14696",
            "mpox-host | 40674* | 14712",
            "mpox-host | 7742* | 14712",
            "mpox-lineage | sh2017/A* | 12888",
            "mpox-lineage | sh2017/B.1 | 4060",
            "mpox-lineage | sh2017/B.1* | 11691",
            "mpox-lineage | sh2017/B.1.* | 11691",
            "mpox-lineage | sh2017/C.1* | 1302",
            "mpox-lineage | sh2023/A | 277",
            "mpox-lineage | sh2023/A* | 1710",
        ],
    )
    fun `counts match production LAPIS`(organism: String, value: String, expected: Int) {
        assertThat(organisms.getValue(organism).count(value), equalTo(expected))
    }

    @ParameterizedTest(name = "{0}: {1}")
    @CsvSource(
        delimiter = '|',
        value = [
            "marburg | 12345",
            "andv | 12345",
            "mpox-lineage | sh2017/F*",
            "mpox-lineage | nope",
        ],
    )
    fun `values outside the definition are rejected like production LAPIS`(organism: String, value: String) {
        val o = organisms.getValue(organism)
        val lineage = value.removeSuffix("*")
        assertThat(
            assertThrows<QueryBadRequestException> { o.count(value) }.message,
            equalTo("Error from SILO: The lineage '$lineage' is not a valid lineage for column '${o.field}'."),
        )
    }

    private companion object {
        const val TAXONOMY_SERVICE = "http://loculus-taxonomy-service:5000"
    }
}
