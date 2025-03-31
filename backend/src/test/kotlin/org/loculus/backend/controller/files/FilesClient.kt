package org.loculus.backend.controller.files

import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.withAuth
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post

class FilesClient(private val mockMvc: MockMvc) {

    fun requestUploads(groupId: Int?, numberFiles: Int?, jwt: String = jwtForDefaultUser): ResultActions {
        val request = post("/files/request-uploads")
            .withAuth(jwt)
        groupId?.let { request.param("groupId", it.toString()) }
        numberFiles?.let { request.param("numberFiles", it.toString()) }
        return mockMvc.perform(request)
    }
}
