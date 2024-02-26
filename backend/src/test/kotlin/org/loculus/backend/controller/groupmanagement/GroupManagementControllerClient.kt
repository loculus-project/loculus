package org.loculus.backend.controller.groupmanagement

import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.api.Group
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.withAuth
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put

class GroupManagementControllerClient(private val mockMvc: MockMvc, private val objectMapper: ObjectMapper) {
    fun createNewGroup(group: Group = NEW_GROUP, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        post("/groups")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(objectMapper.writeValueAsString(group))
            .withAuth(jwt),
    )

    fun createNewGroupWithBody(body: String, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        post("/groups")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(body)
            .withAuth(jwt),
    )

    fun getDetailsOfGroup(group: Group = NEW_GROUP, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/groups/${group.groupName}")
            .withAuth(jwt),
    )

    fun getGroupsOfUser(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/groups")
            .withAuth(jwt),
    )

    fun addUserToGroup(
        usernameToAdd: String,
        group: Group = NEW_GROUP,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        put("/groups/${group.groupName}/users/$usernameToAdd")
            .withAuth(jwt),
    )

    fun removeUserFromGroup(
        userToRemove: String,
        group: Group = NEW_GROUP,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        delete("/groups/${group.groupName}/users/$userToRemove")
            .withAuth(jwt),
    )
}
