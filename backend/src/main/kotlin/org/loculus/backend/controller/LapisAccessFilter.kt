package org.loculus.backend.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

private const val GROUP_ID_FIELD = "groupId"

@Component
class LapisAccessFilter(
    private val objectMapper: ObjectMapper,
    private val groupManagementDatabaseService: GroupManagementDatabaseService,
) {
    fun prepareBody(body: JsonNode?, authenticatedUser: AuthenticatedUser, versionStatus: String? = null): ByteArray {
        val node: ObjectNode = when {
            body == null || body.isNull -> objectMapper.createObjectNode()
            body.isObject -> body.deepCopy()
            else -> throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body must be a JSON object")
        }
        if (versionStatus != null) {
            node.put("versionStatus", versionStatus)
        }
        visibilityQueryFor(authenticatedUser)?.let { visibilityQuery ->
            val advancedQuery = node.get("advancedQuery")?.asText()?.takeIf { it.isNotBlank() }
            node.put("advancedQuery", combineAdvancedQueries(advancedQuery, visibilityQuery))
        }
        return objectMapper.writeValueAsBytes(node)
    }

    fun prepareBody(
        rawBody: ByteArray,
        authenticatedUser: AuthenticatedUser,
        versionStatus: String? = null,
    ): ByteArray {
        val body = rawBody.takeIf { it.isNotEmpty() }?.let { objectMapper.readTree(it) }
        return prepareBody(body, authenticatedUser, versionStatus)
    }

    fun prepareQuery(
        queryString: String?,
        authenticatedUser: AuthenticatedUser,
        versionStatus: String? = null,
    ): String {
        val queryParameters = parseQueryString(queryString).toMutableList()
        if (versionStatus != null) {
            queryParameters.add("versionStatus" to versionStatus)
        }
        visibilityQueryFor(authenticatedUser)?.let { visibilityQuery ->
            val existingAdvancedQueries = queryParameters
                .filter { it.first == "advancedQuery" }
                .map { it.second }
                .filter { it.isNotBlank() }
            queryParameters.removeAll { it.first == "advancedQuery" }
            queryParameters.add(
                "advancedQuery" to combineAdvancedQueries(
                    existingAdvancedQueries.takeIf { it.isNotEmpty() }?.joinToString(" and ") { "($it)" },
                    visibilityQuery,
                ),
            )
        }
        if (queryParameters.isEmpty()) return ""
        return "?" + queryParameters.joinToString("&") { (key, value) ->
            "${urlEncode(key)}=${urlEncode(value)}"
        }
    }

    private fun visibilityQueryFor(authenticatedUser: AuthenticatedUser): String? {
        if (authenticatedUser.isSuperUser) return null

        val groupClauses = groupManagementDatabaseService.getGroupIdsOfUser(authenticatedUser)
            .map { "$GROUP_ID_FIELD=$it" }
        return groupClauses.ifEmpty { listOf("$GROUP_ID_FIELD=-1") }.joinToString(" or ")
    }

    private fun combineAdvancedQueries(existingQuery: String?, visibilityQuery: String) = listOfNotNull(
        existingQuery?.let { "($it)" },
        "($visibilityQuery)",
    ).joinToString(" and ")

    private fun parseQueryString(queryString: String?): List<Pair<String, String>> {
        if (queryString.isNullOrBlank()) return emptyList()
        return queryString.split("&").mapNotNull { part ->
            val (key, value) = part.split("=", limit = 2).let {
                it[0] to it.getOrElse(1) { "" }
            }
            if (key.isBlank()) null else urlDecode(key) to urlDecode(value)
        }
    }

    private fun urlEncode(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private fun urlDecode(value: String) = URLDecoder.decode(value, StandardCharsets.UTF_8)
}
