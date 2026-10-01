package org.loculus.backend.query.lineage

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.config.QueryEngineMetadata
import org.loculus.backend.config.QueryEngineOrganismConfig
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.query.index.InMemoryOrganismIndex
import org.loculus.backend.query.index.IndexRow
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.index.OrganismIndexProvider
import org.loculus.backend.query.schema.QuerySchema

class LineageDefinitionsTest {
    private val schema = QuerySchema.build(
        "west-nile",
        "West Nile",
        QueryEngineOrganismConfig(
            listOf(
                QueryEngineMetadata("accessionVersion"),
                QueryEngineMetadata("hostTaxonId", hierarchicalFilter = "http://taxonomy"),
                QueryEngineMetadata("lineage", lineageSystem = "wnv"),
            ),
            lineageSystems = mapOf(
                "wnv" to mapOf(1 to "https://example.org/1.yaml", 2 to "https://example.org/2.yaml"),
            ),
        ),
        ReferenceGenome(listOf(ReferenceSequence("main", "ACGT")), emptyList()),
    )

    private fun row(id: Int, host: String?) =
        IndexRow.of(schema, id, mapOf("accessionVersion" to "LOC_$id.1", "hostTaxonId" to host))

    private var index: OrganismIndex? = null
    private val provider = object : OrganismIndexProvider {
        override fun get(organism: String) = index
    }
    private var now = 0L
    private val posted = mutableListOf<List<String>>()
    private val downloaded = mutableListOf<String>()
    private var hierarchyFails = false
    private var downloadFails = true

    private val source = object : LineageSource {
        override fun download(url: String): String {
            downloaded += url
            check(!downloadFails) { "unreachable" }
            return "A: {}\nA.1:\n  parents: [A]\n"
        }

        override fun hierarchy(serviceUrl: String, values: List<String>): String {
            posted += values
            check(!hierarchyFails) { "taxonomy service down" }
            // a spanning tree: root 1, everything else directly below it
            return (listOf("'1': {}") + values.map { "'$it':\n  parents: ['1']" }).joinToString("\n")
        }
    }

    private val definitions = LineageDefinitions(
        mapOf("west-nile" to schema),
        mapOf(
            "west-nile" to mapOf("wnv" to mapOf(1 to "https://example.org/1.yaml", 2 to "https://example.org/2.yaml")),
        ),
        provider,
        source,
        clock = { now },
    )

    private fun hostNodes() = schema.lineageDefinition("hostTaxonId")!!.nodes.keys

    @Test
    fun `hierarchy is rebuilt only when the set of observed values changes`() {
        downloadFails = false
        definitions.refresh()
        assertThat("no index yet", posted, empty())

        val loaded = InMemoryOrganismIndex.build(schema, listOf(row(0, "9606"), row(1, "8782"), row(2, null)), 10)
        index = loaded
        definitions.refresh()
        assertThat(posted, equalTo(listOf(listOf("8782", "9606"))))
        assertThat(hostNodes(), equalTo(setOf("1", "8782", "9606")))

        definitions.refresh()
        loaded.apply(listOf(row(3, "9606")), emptyList(), 11)
        definitions.refresh()
        assertThat("same values, new data version: no request", posted.size, equalTo(1))

        loaded.apply(listOf(row(4, "7160")), emptyList(), 12)
        definitions.refresh()
        assertThat(posted.last(), equalTo(listOf("7160", "8782", "9606")))
        assertThat(hostNodes(), equalTo(setOf("1", "7160", "8782", "9606")))
    }

    @Test
    fun `failures keep the previous definition and are retried with backoff`() {
        index = InMemoryOrganismIndex.build(schema, listOf(row(0, "9606")), 10)
        hierarchyFails = true
        definitions.refresh()
        assertThat(posted.size, equalTo(1))
        assertThat(hostNodes(), empty())
        assertThat("lineage system download failed too", schema.lineageDefinition("wnv")!!.nodes.keys, empty())

        now += 1_000
        definitions.refresh()
        assertThat("still backing off", posted.size, equalTo(1))
        assertThat(downloaded.size, equalTo(1))

        hierarchyFails = false
        downloadFails = false
        now += 10_000
        definitions.refresh()
        assertThat(posted.size, equalTo(2))
        assertThat(hostNodes(), equalTo(setOf("1", "9606")))
        assertThat(downloaded, equalTo(listOf("https://example.org/2.yaml", "https://example.org/2.yaml")))
        assertThat(schema.lineageDefinition("wnv")!!.resolve("A", true), equalTo(setOf("A", "A.1")))

        now += 600_000
        definitions.refresh()
        assertThat("downloaded once", downloaded.size, equalTo(2))
    }

    @Test
    fun `no values means an empty hierarchy without a request`() {
        downloadFails = false
        index = InMemoryOrganismIndex.build(schema, listOf(row(0, null)), 10)
        definitions.refresh()
        assertThat(posted, empty())
        assertThat(hostNodes(), empty())
    }
}
