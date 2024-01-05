package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get

const val USER_NAME = "testUser"

class DatasetControllerClient(private val mockMvc: MockMvc, @Autowired val objectMapper: ObjectMapper) {
    // ...
}
