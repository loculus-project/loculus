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

class DatasetControllerClient(private val mockMvc: MockMvc, @Autowired val objectMapper: ObjectMapper) {
    // ...
}
