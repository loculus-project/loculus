package org.loculus.backend.query.lineage

import com.sun.net.httpserver.HttpServer
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.loculus.backend.query.schema.LineageDefinitionReader
import java.net.InetSocketAddress

class HttpLineageSourceTest {
    private data class Received(val method: String, val query: String?, val contentType: String?, val body: String)

    private val received = mutableListOf<Received>()
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        createContext("/") { exchange ->
            val body = exchange.requestBody.readAllBytes().decodeToString()
            val query = exchange.requestURI.query
            received += Received(exchange.requestMethod, query, exchange.requestHeaders.getFirst("Content-Type"), body)
            val (status, response) = when (exchange.requestURI.path) {
                "/lineages.yaml" -> 200 to "A: {}\n"
                "/silo-lineage" -> if (query == "prune=true") 200 to "'1': {}\n" else 413 to "too large"
                else -> 404 to "not found"
            }
            val bytes = response.toByteArray()
            exchange.sendResponseHeaders(status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        start()
    }
    private val base = "http://127.0.0.1:${server.address.port}"

    @AfterEach
    fun stop() = server.stop(0)

    @Test
    fun `hierarchy posts the values as JSON and retries pruned on 413`() {
        val result = HttpLineageSource().hierarchy("$base/", listOf("8782", "9606"))
        assertThat(result, equalTo("'1': {}\n"))
        assertThat(
            received,
            equalTo(
                listOf(
                    Received("POST", null, "application/json", """{"values":["8782","9606"]}"""),
                    Received("POST", "prune=true", "application/json", """{"values":["8782","9606"]}"""),
                ),
            ),
        )
    }

    @Test
    fun `download returns the body and fails on errors`() {
        assertThat(HttpLineageSource().download("$base/lineages.yaml"), equalTo("A: {}\n"))
        assertThat(
            assertThrows<IllegalStateException> { HttpLineageSource().download("$base/missing.yaml") }.message,
            containsString("answered 404"),
        )
    }

    /** against a running taxonomy service, e.g. `TAXONOMY_SERVICE_URL=http://localhost:5000` */
    @Test
    @EnabledIfEnvironmentVariable(named = "TAXONOMY_SERVICE_URL", matches = ".+")
    fun `the taxonomy service answers with the spanning tree`() {
        val text = HttpLineageSource().hierarchy(System.getenv("TAXONOMY_SERVICE_URL"), listOf("9606"))
        val definition = LineageDefinitionReader.read(text)
        assertThat(definition.resolve("1", true), hasItem("9606"))
        assertThat(definition.nodes.getValue("9606").aliases.single(), containsString("[Taxon 9606]"))
    }
}
