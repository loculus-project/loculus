package org.pathoplexus.backend.controller.groupmanagement

import org.pathoplexus.backend.controller.jwtForDefaultUser
import org.pathoplexus.backend.controller.withAuth
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders

class GroupManagementControllerClient(private val mockMvc: MockMvc) {
    fun createNewGroup(groupName: String = DEFAULT_GROUP_NAME, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            MockMvcRequestBuilders.post("/groups/$groupName")
                .withAuth(jwt),
        )

    fun getDetailsOfGroup(groupName: String = DEFAULT_GROUP_NAME, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            MockMvcRequestBuilders.get("/groups/$groupName")
                .withAuth(jwt),
        )
}
