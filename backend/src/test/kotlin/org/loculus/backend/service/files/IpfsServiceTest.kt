package org.loculus.backend.service.files

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.config.IpfsConfig
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpHeaders
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.Optional
import java.util.concurrent.CompletableFuture
import javax.net.ssl.SSLSession

class IpfsServiceTest {

    private val objectMapper = ObjectMapper()

    @Test
    fun `WHEN IPFS is disabled THEN isEnabled returns false`() {
        val service = IpfsService(IpfsConfig(enabled = false), objectMapper, DummyHttpClient())
        assertFalse(service.isEnabled())
    }

    @Test
    fun `WHEN disabled AND addContent is called THEN IllegalStateException is thrown`() {
        val service = IpfsService(IpfsConfig(enabled = false), objectMapper, DummyHttpClient())
        val exception = assertThrows<IllegalStateException> { service.addContent("hi".toByteArray()) }
        assertEquals("IPFS is not enabled", exception.message)
    }

    @Test
    fun `WHEN disabled AND buildGatewayUrl is called THEN IllegalStateException is thrown`() {
        val service = IpfsService(IpfsConfig(enabled = false), objectMapper, DummyHttpClient())
        assertThrows<IllegalStateException> { service.buildGatewayUrl("bafytest") }
    }

    @Test
    fun `WHEN enabled THEN buildGatewayUrl returns ipfs path on configured gateway`() {
        val service = enabledService(DummyHttpClient())
        assertEquals("https://ipfs.io/ipfs/bafytest", service.buildGatewayUrl("bafytest"))
    }

    @Test
    fun `WHEN addContent is called THEN it POSTs to the configured IPFS API and returns the Hash`() {
        val captured = mutableListOf<HttpRequest>()
        val client = RecordingHttpClient(
            captured,
            responseBody = """{"Name":"file","Hash":"bafyFakeCid","Size":"5"}""",
            statusCode = 200,
        )
        val service = enabledService(client)

        val cid = service.addContent("hello".toByteArray(), "example.fasta")

        assertEquals("bafyFakeCid", cid)
        assertEquals(1, captured.size)
        val request = captured.single()
        assertEquals("POST", request.method())
        assertEquals(
            URI.create("http://ipfs-node:5001/api/v0/add?cid-version=1&pin=true"),
            request.uri(),
        )
        val contentType = request.headers().firstValue("Content-Type").orElse("")
        assert(contentType.startsWith("multipart/form-data; boundary=")) {
            "Expected multipart content-type, got $contentType"
        }
    }

    @Test
    fun `WHEN IPFS returns a non-2xx status THEN IpfsException is thrown`() {
        val client = RecordingHttpClient(mutableListOf(), responseBody = "boom", statusCode = 500)
        assertThrows<IpfsException> { enabledService(client).addContent("hello".toByteArray()) }
    }

    @Test
    fun `WHEN IPFS returns JSON without Hash THEN IpfsException is thrown`() {
        val client = RecordingHttpClient(
            mutableListOf(),
            responseBody = """{"Name":"file","Size":"5"}""",
            statusCode = 200,
        )
        assertThrows<IpfsException> { enabledService(client).addContent("hello".toByteArray()) }
    }

    private fun enabledService(client: HttpClient) = IpfsService(
        IpfsConfig(
            enabled = true,
            apiUrl = "http://ipfs-node:5001",
            gatewayUrl = "https://ipfs.io",
        ),
        objectMapper,
        client,
    )

    private open class DummyHttpClient : HttpClient() {
        override fun cookieHandler(): Optional<java.net.CookieHandler> = Optional.empty()
        override fun connectTimeout(): Optional<java.time.Duration> = Optional.empty()
        override fun followRedirects(): Redirect = Redirect.NEVER
        override fun proxy(): Optional<java.net.ProxySelector> = Optional.empty()
        override fun sslContext(): javax.net.ssl.SSLContext = javax.net.ssl.SSLContext.getDefault()
        override fun sslParameters(): javax.net.ssl.SSLParameters = javax.net.ssl.SSLParameters()
        override fun authenticator(): Optional<java.net.Authenticator> = Optional.empty()
        override fun version(): Version = Version.HTTP_1_1
        override fun executor(): Optional<java.util.concurrent.Executor> = Optional.empty()

        override fun <T> send(request: HttpRequest, handler: HttpResponse.BodyHandler<T>): HttpResponse<T> =
            throw UnsupportedOperationException("DummyHttpClient should not be invoked in this test")

        override fun <T> sendAsync(
            request: HttpRequest,
            handler: HttpResponse.BodyHandler<T>,
        ): CompletableFuture<HttpResponse<T>> = CompletableFuture.failedFuture(UnsupportedOperationException())

        override fun <T> sendAsync(
            request: HttpRequest,
            handler: HttpResponse.BodyHandler<T>,
            pushPromiseHandler: HttpResponse.PushPromiseHandler<T>?,
        ): CompletableFuture<HttpResponse<T>> = sendAsync(request, handler)
    }

    private class RecordingHttpClient(
        private val captured: MutableList<HttpRequest>,
        private val responseBody: String,
        private val statusCode: Int,
    ) : DummyHttpClient() {
        override fun <T> send(request: HttpRequest, handler: HttpResponse.BodyHandler<T>): HttpResponse<T> {
            captured.add(request)
            @Suppress("UNCHECKED_CAST")
            return FakeResponse(request, responseBody, statusCode) as HttpResponse<T>
        }
    }

    private class FakeResponse(private val request: HttpRequest, private val body: String, private val status: Int) :
        HttpResponse<String> {
        override fun statusCode(): Int = status
        override fun request(): HttpRequest = request
        override fun previousResponse(): Optional<HttpResponse<String>> = Optional.empty()
        override fun headers(): HttpHeaders = HttpHeaders.of(emptyMap()) { _, _ -> true }
        override fun body(): String = body
        override fun sslSession(): Optional<SSLSession> = Optional.empty()
        override fun uri(): URI = request.uri()
        override fun version(): HttpClient.Version = HttpClient.Version.HTTP_1_1
    }
}
