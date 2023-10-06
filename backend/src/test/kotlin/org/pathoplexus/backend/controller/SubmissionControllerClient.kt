package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import org.pathoplexus.backend.service.OriginalData
import org.pathoplexus.backend.service.UnprocessedData
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers

const val USER_NAME = "testUser"

class SubmissionControllerClient(private val mockMvc: MockMvc, @Autowired val objectMapper: ObjectMapper) {

    fun submit(username: String, metadataFile: MockMultipartFile, sequencesFile: MockMultipartFile): ResultActions =
        mockMvc.perform(
            multipart("/submit")
                .file(sequencesFile)
                .file(metadataFile)
                .param("username", username),
        )

    fun submitDefaultFiles(username: String = USER_NAME): ResultActions =
        submit(username, SubmitFiles.DefaultFiles.metadataFile, SubmitFiles.DefaultFiles.sequencesFile)

    fun extractUnprocessedData(numberOfSequences: Int): ResultActions =
        mockMvc.perform(
            post("/extract-unprocessed-data")
                .param("numberOfSequences", numberOfSequences.toString()),
        )

    fun submitProcessedData(testData: String): ResultActions {
        return mockMvc.perform(
            post("/submit-processed-data")
                .contentType(MediaType.APPLICATION_NDJSON_VALUE)
                .content(testData),
        )
            .andExpect(MockMvcResultMatchers.status().isOk())
    }

    fun getSequencesOfUser(): MvcResult {
        return mockMvc.perform(
            get("/get-sequences-of-user")
                .param("username", USER_NAME),
        )
            .andExpect(MockMvcResultMatchers.status().isOk())
            .andExpect(MockMvcResultMatchers.content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andReturn()
    }

    fun submitReviewedSequence(userName: String, reviewedData: UnprocessedData): ResultActions {
        return mockMvc.perform(
            post("/submit-reviewed-sequence")
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON_VALUE)
                .content(objectMapper.writeValueAsString(reviewedData)),
        )
    }
}

val emptyOriginalData = OriginalData(metadata = emptyMap(), unalignedNucleotideSequences = emptyMap())
