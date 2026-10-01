package org.loculus.backend.query.api

import io.mockk.every
import io.mockk.mockk
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.index.AggregatedRow
import org.loculus.backend.query.index.MutationRow
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.index.OrganismIndexProvider
import org.loculus.backend.query.store.SequenceKind
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.RequestBuilder
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

/** controller + real request parser + fakes for index and store */
class LapisEndToEndTest {
    private val schema = testSchema()
    private val index = FakeIndex(
        schema,
        mapOf(1 to emptyMap(), 2 to emptyMap()),
        aggregateResult = listOf(AggregatedRow(listOf("CH"), 3), AggregatedRow(listOf("DE"), 5)),
        mutationResult = listOf(MutationRow(0, 2, 'C', 'T', 5, 10), MutationRow(0, 3, 'G', 'A', 1, 10)),
    )
    private val store = FakeStore(
        mapOf(
            1 to """{"accessionVersion":"A.1","country":"CH","age":1}""",
            2 to """{"accessionVersion":"B.1","country":"DE","age":2}""",
        ),
        mapOf(
            Triple(SequenceKind.ALIGNED_AMINO_ACID, 1, 1) to "MKT*",
            Triple(SequenceKind.ALIGNED_NUCLEOTIDE, 0, 2) to "ACGT",
        ),
    )
    private val mockMvc: MockMvc = run {
        val schemas = mockk<QuerySchemaRegistry>()
        every { schemas.get(any()) } returns null
        every { schemas.get("test") } returns schema
        val provider = object : OrganismIndexProvider {
            override fun get(organism: String): OrganismIndex = index
        }
        MockMvcBuilders.standaloneSetup(LapisQueryController(schemas, provider, DefaultQueryRequestParser(), store))
            .setControllerAdvice(LapisExceptionHandler(schemas))
            .build()
    }

    private fun body(request: RequestBuilder): String {
        val started = mockMvc.perform(request).andReturn()
        val result = if (started.request.isAsyncStarted) {
            mockMvc.perform(
                asyncDispatch(started),
            ).andReturn()
        } else {
            started
        }
        return result.response.contentAsString
    }

    @Test
    fun `aggregated csv with ordering and limit`() {
        assertThat(
            body(get("/test/sample/aggregated?fields=country&orderBy=count&limit=1&dataFormat=csv")),
            equalTo("country,count\nCH,3\n"),
        )
        assertThat(
            body(
                post("/test/sample/aggregated").contentType(MediaType.APPLICATION_JSON)
                    .content(
                        """{"fields":["country"],"orderBy":[{"field":"count","type":"descending"}],"dataFormat":"tsv"}""",
                    ),
            ),
            equalTo("country\tcount\nDE\t5\nCH\t3\n"),
        )
        assertThat(
            body(get("/test/sample/aggregated?fields=country&orderBy=count:descending&dataFormat=tsv")),
            equalTo("country\tcount\nDE\t5\nCH\t3\n"),
        )
        assertThat(
            body(get("/test/sample/aggregated?fields=country&orderBy=count:ascending&dataFormat=tsv")),
            equalTo("country\tcount\nCH\t3\nDE\t5\n"),
        )
    }

    @Test
    fun `mutations with fields`() {
        assertThat(
            body(get("/test/sample/nucleotideMutations?fields=mutation,count&orderBy=count&downloadAsFile=true")),
            equalTo("""[{"mutation":"G3A","count":1},{"mutation":"C2T","count":5}]"""),
        )
    }

    @Test
    fun `details and sequences`() {
        assertThat(
            body(get("/test/sample/details?fields=country,accessionVersion&dataFormat=csv&country=CH")),
            equalTo("country,accessionVersion\nCH,A.1\nDE,B.1\n"),
        )
        assertThat(body(get("/test/sample/alignedAminoAcidSequences/E")), equalTo(">A.1\nMKT*\n"))
        assertThat(body(get("/test/sample/alignedAminoAcidSequences")), equalTo(">A.1|E\nMKT*\n"))
        assertThat(body(get("/test/sample/alignedNucleotideSequences")), equalTo(">B.1\nACGT\n"))
        assertThat(
            body(get("/test/sample/alignedNucleotideSequences").header("Accept", "application/json")),
            equalTo("""[{"accessionVersion":"A.1","main":null},{"accessionVersion":"B.1","main":"ACGT"}]"""),
        )
    }

    @Test
    fun `parser errors are LAPIS errors`() {
        mockMvc.perform(get("/test/sample/aggregated?foo=bar")).andExpect(status().isBadRequest)
        mockMvc.perform(get("/test/sample/aggregated?dataFormat=fasta"))
            .andExpect(status().isNotAcceptable)
            .andExpect(jsonPath("\$.error.status").value(406))
    }
}
