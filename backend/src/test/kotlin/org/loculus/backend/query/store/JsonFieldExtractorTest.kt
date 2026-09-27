package org.loculus.backend.query.store

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

class JsonFieldExtractorTest {
    @Test
    fun `extracts requested fields with Postgres text-extraction semantics`() {
        val json = """{"a": "x \"q\" ä", "skip": {"deep": [1, 2]}, "n": 0.000010, "i": 12, "b": false, """ +
            """"nul": null, "obj": {"k": [1, "v"]}}"""
        val values = JsonFieldExtractor(listOf("i", "a", "missing", "n", "b", "nul", "obj")).extract(json)
        assertThat(
            values.toList(),
            equalTo(listOf("12", "x \"q\" ä", null, "0.000010", "false", null, """{"k":[1,"v"]}""")),
        )
    }
}
