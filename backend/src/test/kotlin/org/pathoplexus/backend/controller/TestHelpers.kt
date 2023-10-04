package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers
import org.testcontainers.shaded.org.awaitility.Awaitility.await

val jacksonObjectMapper: ObjectMapper = jacksonObjectMapper().findAndRegisterModules()

inline fun <reified T> ResultActions.expectNdjsonAndGetContent(): List<T> {
    andExpect(MockMvcResultMatchers.status().isOk)
    andExpect(MockMvcResultMatchers.content().contentType("application/x-ndjson"))
    val response = andReturn()

    await().until {
        response.response.isCommitted
    }

    val content = response.response.contentAsString

    return content.lines().filter { it.isNotEmpty() }.map { jacksonObjectMapper.readValue(it) }
}
