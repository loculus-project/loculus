package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.query.filter.StringEquals

class CapacityTest {
    private val schema = IndexTestSupport.schema()

    private fun row(id: Int) = IndexRow.fromAlignedSequences(
        schema,
        id,
        mapOf("accessionVersion" to "A$id.1", "country" to "CH", "age" to id),
        mapOf("main" to "ACGTACGTACGTACGTACGTCAGTACGTAC"),
    )

    private fun capacity(index: InMemoryOrganismIndex): Int =
        InMemoryOrganismIndex::class.java.getDeclaredField("capacity").also { it.isAccessible = true }.getInt(index)

    @Test
    fun `growth steps are a sixteenth of the capacity, between 4096 and 1M ids`() {
        assertThat(InMemoryOrganismIndex.capacityStep(0), equalTo(4096))
        assertThat(InMemoryOrganismIndex.capacityStep(100_000), equalTo(6250))
        assertThat(InMemoryOrganismIndex.capacityStep(20_000_000), equalTo(1 shl 20))
    }

    @Test
    fun `the loader leaves headroom and later ids grow the columns by one step`() {
        val rows = (0 until 5000).map(::row)
        val index = IndexLoader.load(schema, 4999, { from, to, c -> rows.subList(from, to + 1).forEach(c) }, 1, 2, 1000)
        assertThat(capacity(index), equalTo(5000 + 4096))
        index.apply((5000 until 9096).map(::row), emptyList())
        assertThat(capacity(index), equalTo(9096))
        index.apply(listOf(row(9096)), emptyList())
        assertThat(capacity(index), equalTo(9096 + 4096))
        index.apply(listOf(row(40_000)), emptyList())
        assertThat(capacity(index) > 40_000, equalTo(true))
        for (id in listOf(0, 4999, 5000, 9095, 9096, 40_000)) {
            assertThat(
                index.evaluate(StringEquals("accessionVersion", "A$id.1")).toArray().toList(),
                equalTo(listOf(id)),
            )
            assertThat(index.value(id, "age"), equalTo(id.toLong()))
        }
    }
}
