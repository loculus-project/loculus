package org.pathoplexus.backend.controller

import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post

const val USER_NAME = "testUser"

class SubmissionControllerClient(private val mockMvc: MockMvc) {
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
}
