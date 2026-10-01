package org.loculus.backend.query.api

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.query.index.QueryIndexService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post

/** conditional requests through the backend's real filter chain (Spring Security's header writers, CORS) */
@EndpointTest(
    properties = [
        "loculus.query-engine.enabled=true",
        "loculus.query-engine.projector-initial-delay-ms=3600000",
        "loculus.query-engine.projector-interval-ms=3600000",
    ],
)
class LapisConditionalRequestEndpointTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val service: QueryIndexService,
) {
    private fun awaitIndex() {
        val deadline = System.currentTimeMillis() + 30_000
        while (DEFAULT_ORGANISM in service.organismsNotLoaded()) {
            check(System.currentTimeMillis() < deadline) { "index not loaded" }
            Thread.sleep(20)
        }
    }

    private fun aggregated(): MockHttpServletRequestBuilder = post("/$DEFAULT_ORGANISM/sample/aggregated")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""{"fields":[]}""")
        .header("Origin", "https://example.org")

    @Test
    fun `responses are revalidatable, and a POST with a matching If-None-Match gets a bare 304`() {
        awaitIndex()
        val first = mockMvc.perform(aggregated()).andReturn().response
        assertThat(first.status, equalTo(200))
        val etag = first.getHeader("ETag")
        assertThat(etag, notNullValue())
        // no-cache replaces Spring Security's no-store default; its Pragma/Expires are not added
        assertThat(first.getHeaders("Cache-Control"), equalTo(listOf("no-cache")))
        assertThat(first.getHeader("Pragma"), nullValue())
        assertThat(first.getHeader("Expires"), nullValue())
        assertThat(first.getHeaders("Vary"), hasItem("Accept, Accept-Encoding"))
        assertThat(first.getHeader("Access-Control-Expose-Headers"), containsString("ETag"))

        val second = mockMvc.perform(aggregated().header("If-None-Match", etag!!)).andReturn().response
        assertThat(second.status, equalTo(304))
        assertThat(second.contentAsByteArray.size, equalTo(0))
        assertThat(second.getHeader("ETag"), equalTo(etag))
        assertThat(second.getHeaders("Cache-Control"), equalTo(listOf("no-cache")))
        assertThat(second.getHeader("Pragma"), nullValue())

        val get = mockMvc.perform(
            get("/$DEFAULT_ORGANISM/sample/aggregated").header("If-None-Match", "W/\"other\", $etag"),
        ).andReturn().response
        assertThat(get.status, equalTo(304))
    }

    @Test
    fun `GET responses may be stored by the browser and revalidated, file downloads may not`() {
        awaitIndex()
        fun browserGet(path: String) =
            get(path).header("Origin", "https://example.org").header("Accept-Encoding", "gzip")
        // buffered, and streamed (sequences are never buffered)
        for (path in listOf("aggregated", "unalignedNucleotideSequences")) {
            val first = mockMvc.perform(browserGet("/$DEFAULT_ORGANISM/sample/$path")).andReturn().response
            assertThat(path, first.status, equalTo(200))
            assertThat(path, first.getHeaders("Cache-Control"), equalTo(listOf("no-cache")))
            assertThat(path, first.getHeader("Pragma"), nullValue())
            val vary = first.getHeaders("Vary").joinToString(", ")
            // content negotiation and CORS (the Access-Control-Allow-Origin a cached response carries)
            assertThat(path, vary, containsString("Accept, Accept-Encoding"))
            assertThat(path, vary, containsString("Origin"))
            val etag = first.getHeader("ETag")
            assertThat(path, etag, notNullValue())

            val revalidated = mockMvc.perform(
                browserGet("/$DEFAULT_ORGANISM/sample/$path").header("If-None-Match", etag!!),
            ).andReturn().response
            assertThat(path, revalidated.status, equalTo(304))
            assertThat(path, revalidated.getHeader("ETag"), equalTo(etag))
            assertThat(path, revalidated.getHeaders("Cache-Control"), equalTo(listOf("no-cache")))
            assertThat(path, revalidated.getHeaders("Vary").joinToString(", "), equalTo(vary))
        }

        val download = mockMvc.perform(
            get("/$DEFAULT_ORGANISM/sample/details?dataFormat=tsv&downloadAsFile=true"),
        ).andReturn().response
        assertThat(download.status, equalTo(200))
        assertThat(download.getHeader("Content-Disposition"), containsString("attachment"))
        assertThat(download.getHeaders("Cache-Control"), equalTo(listOf("no-store")))

        // the website's POST cache stores what it may revalidate: no-store would switch it off (no HTTP cache
        // stores POST responses anyway)
        val post = mockMvc.perform(aggregated()).andReturn().response
        assertThat(post.getHeaders("Cache-Control"), equalTo(listOf("no-cache")))
    }

    @Test
    fun `errors carry no validator and stay no-store`() {
        awaitIndex()
        val response = mockMvc.perform(
            post("/$DEFAULT_ORGANISM/sample/aggregated").contentType(MediaType.APPLICATION_JSON)
                .content("""{"fields":["noSuchField"]}"""),
        ).andReturn().response
        assertThat(response.status, equalTo(400))
        assertThat(response.getHeader("ETag"), nullValue())
        assertThat(response.getHeader("Cache-Control"), containsString("no-store"))
    }
}
