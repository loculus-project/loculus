package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.AccessionVersionInterface
import org.pathoplexus.backend.api.SequenceEntryStatus
import org.pathoplexus.backend.api.Status
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.shaded.org.awaitility.Awaitility.await

const val DEFAULT_ORGANISM = "dummyOrganism"
const val OTHER_ORGANISM = "otherOrganism"

fun AccessionVersionInterface.toAccessionVersion() = AccessionVersion(this.accession, this.version)

fun List<AccessionVersionInterface>.getAccessionVersions() = map { it.toAccessionVersion() }

fun addOrganismToPath(path: String, organism: String = DEFAULT_ORGANISM) =
    "/$organism/${path.trimStart('/')}"

val jacksonObjectMapper: ObjectMapper = jacksonObjectMapper().findAndRegisterModules()

inline fun <reified T> ResultActions.expectNdjsonAndGetContent(): List<T> {
    andExpect(status().isOk)
    andExpect(content().contentType("application/x-ndjson"))

    val content = awaitResponse(andReturn())

    return content.lines().filter { it.isNotEmpty() }.map { jacksonObjectMapper.readValue(it) }
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
