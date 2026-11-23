package org.loculus.backend.api.v1.groups

import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.config.V1_API_VERSION
import org.loculus.backend.testutil.jwtForDefaultUser
import org.loculus.backend.testutil.withAuth
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put

val V1_NEW_GROUP = V1NewGroup(
    groupName = "v1Group",
    institution = "v1Institution",
    address = V1Address(
        line1 = "v1AddressLine1",
        line2 = "v1AddressLine2",
        city = "v1City",
        state = "v1State",
        postalCode = "v1PostalCode",
        country = "v1Country",
    ),
    contactEmail = "v1Email",
)

class GroupsControllerClient(private val mockMvc: MockMvc, private val objectMapper: ObjectMapper) {
    fun createGroup(
        group: V1NewGroup = V1_NEW_GROUP,
        jwt: String? = jwtForDefaultUser,
        body: String = objectMapper.writeValueAsString(group),
        contentType: String = MediaType.APPLICATION_JSON_VALUE,
    ): ResultActions = mockMvc.perform(
        post("/$V1_API_VERSION/groups")
            .contentType(contentType)
            .content(body)
            .withAuth(jwt),
    )

    fun updateGroup(
        groupId: Any,
        group: V1NewGroup = V1_NEW_GROUP,
        jwt: String? = jwtForDefaultUser,
        body: String = objectMapper.writeValueAsString(group),
        contentType: String = MediaType.APPLICATION_JSON_VALUE,
    ): ResultActions = mockMvc.perform(
        put("/$V1_API_VERSION/groups/$groupId")
            .contentType(contentType)
            .content(body)
            .withAuth(jwt),
    )

    fun getGroupDetails(groupId: Any, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(get("/$V1_API_VERSION/groups/$groupId").withAuth(jwt))

    fun getGroupUsers(groupId: Any, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(get("/$V1_API_VERSION/groups/$groupId/users").withAuth(jwt))

    fun getUserGroups(jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(get("/$V1_API_VERSION/me/groups").withAuth(jwt))

    fun getGroups(name: String? = null, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/$V1_API_VERSION/groups").apply { if (name != null) param("name", name) }.withAuth(jwt),
    )

    fun addUserToGroup(groupId: Any, username: String, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(put("/$V1_API_VERSION/groups/$groupId/users/$username").withAuth(jwt))

    fun removeUserFromGroup(groupId: Any, username: String, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(delete("/$V1_API_VERSION/groups/$groupId/users/$username").withAuth(jwt))
}
