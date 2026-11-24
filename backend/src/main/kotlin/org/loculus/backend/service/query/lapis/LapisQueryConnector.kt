package org.loculus.backend.service.query.lapis

import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.errors.ServiceUnavailableException
import org.loculus.backend.errors.UnprocessableEntityException
import org.loculus.backend.service.query.QueryConnector
import org.loculus.backend.service.query.QueryParams
import org.loculus.backend.service.query.StreamedResponse
import org.loculus.backend.types.Organism
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@Component
class LapisQueryConnector(
    private val backendConfig: BackendConfig,
    private val restClient: RestClient,
    private val objectMapper: ObjectMapper,
) : QueryConnector {
    override fun metadata(params: QueryParams): StreamedResponse {
        val body = buildRequestBody(params)
        return post(params.organism, "/sample/details", body)
    }

    private fun buildRequestBody(params: QueryParams): Map<String, Any> = buildMap {
        put("versionStatus", "LATEST_VERSION")
        put("isRevocation", false)
        params.limit?.let { put("limit", it) }
        params.offset?.let { put("offset", it) }
        params.sort?.let {
            val type = if (it.descending) "descending" else "ascending"
            put("orderBy", listOf(mapOf("field" to it.field, "type" to type)))
        }
    }

    private fun post(organism: Organism, path: String, body: Map<String, Any>): StreamedResponse {
        val response = try {
            restClient.post()
                .uri(backendConfig.getLapisUrl(organism) + path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(objectMapper.writeValueAsString(body))
                .exchange({ _, response -> response }, false)
        } catch (e: ResourceAccessException) {
            throw ServiceUnavailableException("Could not reach LAPIS for organism ${organism.name}: ${e.message}")
        }

        val status = response.statusCode
        if (!status.is2xxSuccessful) {
            val message = response.use { it.body.readAllBytes().decodeToString() }
            if (status.is4xxClientError) {
                throw UnprocessableEntityException("LAPIS rejected the query: $message")
            }
            throw ServiceUnavailableException("LAPIS returned $status: $message")
        }

        val headers = HttpHeaders()
        response.headers.contentType?.let { headers.contentType = it }

        return StreamedResponse(headers, StreamingResponseBody { out -> response.use { it.body.transferTo(out) } })
    }
}
