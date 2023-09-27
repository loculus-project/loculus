package org.pathoplexus.backend.controller

import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders

class SubmissionControllerClient(private val mockMvc: MockMvc) {
    fun submit(username: String, metadataFile: MockMultipartFile, sequencesFile: MockMultipartFile): ResultActions {
        return mockMvc.perform(
            MockMvcRequestBuilders.multipart("/submit")
                .file(sequencesFile)
                .file(metadataFile)
                .param("username", username),
        )
    }
}
