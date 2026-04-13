package org.loculus.backend.service.files

import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.config.IpfsConfig
import org.springframework.stereotype.Service
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * Service that publishes files to an IPFS network and builds gateway URLs so that clients can
 * retrieve the content (e.g. FASTA files) via IPFS.
 *
 * The service speaks the Kubo-compatible HTTP API (`POST /api/v0/add`) which is supported by
 * go-ipfs / Kubo as well as several pinning services.
 */
@Service
class IpfsService internal constructor(
    private val ipfsConfig: IpfsConfig,
    private val objectMapper: ObjectMapper,
    private val httpClient: HttpClient,
) {

    @org.springframework.beans.factory.annotation.Autowired
    constructor(ipfsConfig: IpfsConfig, objectMapper: ObjectMapper) :
        this(ipfsConfig, objectMapper, defaultHttpClient())

    /**
     * Whether IPFS support is enabled in the configuration.
     */
    fun isEnabled(): Boolean = ipfsConfig.enabled

    /**
     * Builds the public IPFS gateway URL for the given CID, e.g.
     * `https://ipfs.io/ipfs/bafy...`.
     */
    fun buildGatewayUrl(cid: String): String {
        assertIsEnabled()
        val gateway = ipfsConfig.gatewayUrl!!
        return "$gateway/ipfs/$cid"
    }

    /**
     * Publishes the given bytes to the configured IPFS node and returns the resulting CID.
     *
     * The call is synchronous and will pin the content on the node by default. The remote endpoint
     * is `{apiUrl}/api/v0/add?cid-version=1&pin=true`.
     *
     * @param content  The bytes to add to IPFS.
     * @param fileName A filename hint used only in the multipart request (the CID is computed from
     *                 [content]).
     */
    fun addContent(content: ByteArray, fileName: String = "file"): String {
        assertIsEnabled()
        val apiUrl = ipfsConfig.apiUrl!!
        val uri = URI.create("$apiUrl/api/v0/add?cid-version=1&pin=true")
        val boundary = "----loculus-ipfs-${System.nanoTime()}"
        val body = buildMultipartBody(boundary, fileName, content)

        val request = HttpRequest.newBuilder(uri)
            .timeout(Duration.ofSeconds(REQUEST_TIMEOUT_SECONDS))
            .header("Content-Type", "multipart/form-data; boundary=$boundary")
            .POST(HttpRequest.BodyPublishers.ofByteArray(body))
            .build()

        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299) {
            throw IpfsException(
                "IPFS add failed with status ${response.statusCode()}: ${response.body()}",
            )
        }

        // Kubo streams one JSON object per file/directory; we sent a single file so the first line
        // (and usually only line) contains the response for it.
        val firstLine = response.body().lineSequence()
            .firstOrNull { it.isNotBlank() }
            ?: throw IpfsException("IPFS returned an empty response")
        val node = objectMapper.readTree(firstLine)
        val hash = node.get("Hash")?.asText()
            ?: throw IpfsException("IPFS response did not contain a 'Hash' field: ${response.body()}")
        return hash
    }

    private fun assertIsEnabled() {
        if (!ipfsConfig.enabled) {
            throw IllegalStateException("IPFS is not enabled")
        }
    }

    private fun buildMultipartBody(boundary: String, fileName: String, content: ByteArray): ByteArray {
        val header = buildString {
            append("--").append(boundary).append("\r\n")
            append("Content-Disposition: form-data; name=\"file\"; filename=\"")
            append(fileName.replace("\"", "\\\""))
            append("\"\r\n")
            append("Content-Type: application/octet-stream\r\n\r\n")
        }.toByteArray(Charsets.UTF_8)
        val footer = "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8)
        return header + content + footer
    }

    companion object {
        private const val REQUEST_TIMEOUT_SECONDS = 60L

        private fun defaultHttpClient(): HttpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build()
    }
}

class IpfsException(message: String) : RuntimeException(message)
