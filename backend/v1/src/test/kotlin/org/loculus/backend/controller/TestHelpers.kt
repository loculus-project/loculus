package org.loculus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.DateTimeUnit.Companion.MONTH
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import org.awaitility.Awaitility.await
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.hasEntry
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.not
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.ProcessingResult
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
import kotlin.time.Clock

const val DEFAULT_ORGANISM = "dummyOrganism"
const val OTHER_ORGANISM = "otherOrganism"
const val ORGANISM_WITHOUT_CONSENSUS_SEQUENCES = "dummyOrganismWithoutConsensusSequences"
const val DEFAULT_PIPELINE_VERSION = 1L
const val DEFAULT_EXTERNAL_METADATA_UPDATER = "ena"
const val DEFAULT_SIMPLE_FILE_CONTENT = "Hello, world!"
val DEFAULT_MULTIPART_FILE_PARTS = listOf(
    "A".repeat(5 * 1024 * 1024),
    "B".repeat(7),
)
val DEFAULT_MULTIPART_FILE_CONTENT = DEFAULT_MULTIPART_FILE_PARTS.joinToString("")

/**
 * As defined in the test backend configs
 */
const val DUMMY_ORGANISM_MAIN_SEQUENCE = "ATTAAAGGTTTATACCTTCCCAGGTAACAAACCAACCAACTTTCGATCT"

fun dateMonthsFromNow(months: Int) = Clock.System.now().toLocalDateTime(DateProvider.timeZone).date.plus(months, MONTH)

fun AccessionVersionInterface.toAccessionVersion() = AccessionVersion(this.accession, this.version)

fun List<AccessionVersionInterface>.getAccessionVersions() = map { it.toAccessionVersion() }

fun List<AccessionVersionInterface>.toAccessionVersionMatcher() = map { entry ->
    allOf(
        hasEntry("accession", entry.accession),
        hasEntry("version", entry.version.toInt()),
    )
}

fun jsonContainsAccessionVersionsInAnyOrder(expectedVersions: List<AccessionVersionInterface>): ResultMatcher =
    jsonPath("\$[*]", containsInAnyOrder(expectedVersions.toAccessionVersionMatcher()))

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
    result.getAsyncResult()

    return result.response.contentAsString
}

fun SequenceEntryStatus.assertStatusIs(status: Status): SequenceEntryStatus {
    assertThat(this.status, `is`(status))
    return this
}

fun SequenceEntryStatus.assertHasError(error: Boolean): SequenceEntryStatus {
    if (error) {
        assertThat(this.processingResult, `is`(ProcessingResult.HAS_ERRORS))
    } else {
        assertThat(this.processingResult, not(`is`(ProcessingResult.HAS_ERRORS)))
    }
    return this
}

fun SequenceEntryStatus.assertSubmitterIs(submitter: String): SequenceEntryStatus {
    assertThat(this.submitter, `is`(submitter))
    return this
}

fun SequenceEntryStatus.assertGroupIdIs(groupId: Int): SequenceEntryStatus {
    assertThat(this.groupId, `is`(groupId))
    return this
}

fun SequenceEntryStatus.assertIsRevocationIs(revoked: Boolean): SequenceEntryStatus {
    if (revoked) {
        assertThat(this.isRevocation, `is`(true))
    } else {
        assertThat(this.isRevocation, `is`(false))
    }
    return this
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
