package org.loculus.backend.controller.groupmanagement

import com.fasterxml.jackson.databind.ObjectMapper
import com.jayway.jsonpath.JsonPath
import org.loculus.backend.api.Address
import org.loculus.backend.api.NewGroup
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.withAuth
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put

const val NEW_GROUP_NAME = "newGroup"
val NEW_GROUP = NewGroup(
    groupName = NEW_GROUP_NAME,
    institution = "newInstitution",
    address = Address(
        line1 = "newAddressLine1",
        line2 = "newAddressLine2",
        city = "newCity",
        state = "newState",
        postalCode = "newPostalCode",
        country = "newCountry",
    ),
    contactEmail = "newEmail",
)

class GroupManagementControllerClient(private val mockMvc: MockMvc, private val objectMapper: ObjectMapper) {
    fun createNewGroup(group: NewGroup = NEW_GROUP, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
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

    fun getDetailsOfGroup(groupId: Int, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/groups/$groupId")
            .withAuth(jwt),
    )

    fun getGroupsOfUser(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/user/groups").withAuth(jwt),
    )

    fun getAllGroups(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/groups").withAuth(jwt),
    )

    fun addUserToGroup(groupId: Int, usernameToAdd: String, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            put("/groups/$groupId/users/$usernameToAdd")
                .withAuth(jwt),
        )

    fun removeUserFromGroup(groupId: Int, userToRemove: String, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            delete("/groups/$groupId/users/$userToRemove")
                .withAuth(jwt),
        )
}

fun ResultActions.andGetGroupId(): Int = andReturn()
    .response
    .contentAsString
    .let { JsonPath.read(it, "\$.groupId") }!!
