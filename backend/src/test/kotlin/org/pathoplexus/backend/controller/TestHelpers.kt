package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.assertj.core.api.Assertions
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers
import org.testcontainers.shaded.org.awaitility.Awaitility.await
import java.io.File

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

fun awaitResponse(result: MvcResult): String {
    await().until {
        result.response.isCommitted
    }
    return result.response.contentAsString
}

fun expectStatusInResponse(result: MvcResult, numberOfSequences: Int, expectedStatus: String): String {
    awaitResponse(result)

    val responseContent = result.response.contentAsString
    val statusCount = responseContent.split(expectedStatus).size - 1

    Assertions.assertThat(statusCount).isEqualTo(numberOfSequences)

    return responseContent
}

fun processedInputDataFromFile(fileName: String): String = inputData[fileName] ?: error(
    "$fileName.json not found",
)

private val inputData: Map<String, String> by lazy {
    val fileMap = mutableMapOf<String, String>()

    val jsonResourceDirectory = "src/test/resources/processedInputData"

    val directory = File(jsonResourceDirectory)

    directory.listFiles { _, name -> name.endsWith(".json") }?.forEach { file ->
        val fileName = file.nameWithoutExtension
        val formattedJson = file.readText().replace("\n", "").replace("\r", "").replace(" ", "")
        fileMap[fileName] = formattedJson
    }

    fileMap
}
