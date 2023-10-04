package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.pathoplexus.backend.service.SequenceVersionStatus
import org.pathoplexus.backend.service.Status
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers
import org.testcontainers.shaded.org.awaitility.Awaitility.await

val jacksonObjectMapper: ObjectMapper = jacksonObjectMapper().findAndRegisterModules()

inline fun <reified T> ResultActions.expectNdjsonAndGetContent(): List<T> {
    andExpect(MockMvcResultMatchers.status().isOk)
    andExpect(MockMvcResultMatchers.content().contentType("application/x-ndjson"))

    val content = awaitResponse(andReturn())

    return content.lines().filter { it.isNotEmpty() }.map { jacksonObjectMapper.readValue(it) }
}

fun awaitResponse(result: MvcResult): String {
    await().until {
        result.response.isCommitted
    }
    return result.response.contentAsString
}

fun SequenceVersionStatus.assertStatusIs(status: Status) {
    assertThat(this.status, `is`(status))
}
