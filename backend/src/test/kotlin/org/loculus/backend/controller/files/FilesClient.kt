package org.loculus.backend.controller.files

import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.withAuth
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post

class FilesClient(private val mockMvc: MockMvc) {

    fun requestUploads(groupId: Int?, numberFiles: Int?, jwt: String = jwtForDefaultUser): ResultActions {
        var request = post("/files/request-uploads")
            .withAuth(jwt)
        if (groupId != null) {
            request = request.param("groupId", groupId.toString())
        }
        if (numberFiles != null) {
            request = request.param("numberFiles", numberFiles.toString())
        }
        return mockMvc.perform(request)
    }
}
