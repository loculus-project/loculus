package org.loculus.backend.controller.groupmanagement

import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.withAuth
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put

class GroupManagementControllerClient(private val mockMvc: MockMvc) {
    fun createNewGroup(groupName: String = NEW_GROUP, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            post("/groups")
                .contentType(MediaType.APPLICATION_JSON_VALUE)
                .content("""{"groupName":"$groupName"}""")
                .withAuth(jwt),
        )

    fun getDetailsOfGroup(groupName: String = NEW_GROUP, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            get("/groups/$groupName")
                .withAuth(jwt),
        )

    fun getGroupsOfUser(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/groups")
            .withAuth(jwt),
    )

    fun addUserToGroup(
        usernameToAdd: String,
        groupName: String = NEW_GROUP,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        put("/groups/$groupName/users/$usernameToAdd")
            .withAuth(jwt),
    )

    fun removeUserFromGroup(
        userToRemove: String,
        groupName: String = NEW_GROUP,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        delete("/groups/$groupName/users/$userToRemove")
            .withAuth(jwt),
    )
}
