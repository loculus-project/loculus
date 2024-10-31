package org.loculus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit.Companion.MONTH
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.`is`
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.Status
import org.loculus.backend.utils.DateProvider
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.ResultMatcher
import org.springframework.test.web.servlet.result.MockMvcResultMatchers
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.shaded.org.awaitility.Awaitility.await

const val DEFAULT_ORGANISM = "dummyOrganism"
const val OTHER_ORGANISM = "otherOrganism"
const val DEFAULT_PIPELINE_VERSION = 1L
const val DEFAULT_EXTERNAL_METADATA_UPDATER = "ena"

fun dateMonthsFromNow(months: Int) = Clock.System.now().toLocalDateTime(DateProvider.timeZone).date.plus(months, MONTH)

fun AccessionVersionInterface.toAccessionVersion() = AccessionVersion(this.accession, this.version)

fun List<AccessionVersionInterface>.getAccessionVersions() = map { it.toAccessionVersion() }

fun accessionsInAnyOrder(accessionVersions: List<*>): ResultMatcher = when {
    accessionVersions.isNotEmpty() && accessionVersions.first() is AccessionVersion -> {
        val accVersions = accessionVersions.filterIsInstance<AccessionVersion>()
        jsonPath("\$[*].accession", containsInAnyOrder(*accVersions.map { it.accession }.toTypedArray()))
    }
    accessionVersions.isNotEmpty() && accessionVersions.first() is AccessionVersionInterface -> {
        val accVersionsInterface = accessionVersions.filterIsInstance<AccessionVersionInterface>()
        accessionsInAnyOrder(accVersionsInterface.getAccessionVersions())
    }
    else -> throw IllegalArgumentException("Unsupported type for accessionsInAnyOrder")
}

fun addOrganismToPath(path: String, organism: String = DEFAULT_ORGANISM) = "/$organism/${path.trimStart('/')}"

val jacksonObjectMapper: ObjectMapper = jacksonObjectMapper().findAndRegisterModules()

inline fun <reified T> ResultActions.expectNdjsonAndGetContent(): List<T> {
    andExpect(status().isOk)
    andExpect(content().contentType("application/x-ndjson"))

    val content = awaitResponse(andReturn())

    return content.lines()
        .filter { it.isNotEmpty() }
        .map {
            try {
                jacksonObjectMapper.readValue(it)
            } catch (exception: Exception) {
                throw RuntimeException("Failed to parse line: $it", exception)
            }
        }
}

fun awaitResponse(result: MvcResult): String {
    await().until {
        result.response.isCommitted
    }
    return result.response.contentAsString
}

fun SequenceEntryStatus.assertStatusIs(status: Status) {
    assertThat(this.status, `is`(status))
}

fun expectUnauthorizedResponse(isModifyingRequest: Boolean = false, apiCall: (jwt: String?) -> ResultActions) {
    val response = apiCall(null)

    // Spring handles non-modifying requests differently than modifying requests
    // See https://github.com/spring-projects/spring-security/blob/c2d88eca5ac2b1638e28041e4ee8aaecf6b5ac6a/web/src/main/java/org/springframework/security/web/csrf/CsrfFilter.java#L205
    when (isModifyingRequest) {
        true -> response.andExpect(status().isForbidden)
        false ->
            response
                .andExpect(status().isUnauthorized)
                .andExpect(MockMvcResultMatchers.header().string("WWW-Authenticate", Matchers.containsString("Bearer")))
    }

    apiCall("invalidToken")
        .andExpect(status().isUnauthorized)
        .andExpect(MockMvcResultMatchers.header().string("WWW-Authenticate", Matchers.containsString("Bearer")))
        .andExpect(
            MockMvcResultMatchers.header().string(
                "WWW-Authenticate",
                Matchers.containsString("An error occurred while attempting to decode the Jwt: Malformed token"),
            ),
        )
}

fun expectForbiddenResponse(apiCall: () -> ResultActions) {
    apiCall()
        .andExpect(status().isForbidden)
        .andExpect(MockMvcResultMatchers.header().string("WWW-Authenticate", Matchers.containsString("Bearer")))
}
