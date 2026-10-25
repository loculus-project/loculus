package org.loculus.backend.api.v1.groups

import com.fasterxml.jackson.databind.ObjectMapper
import com.jayway.jsonpath.JsonPath
import org.loculus.backend.testutil.jwtForDefaultUser
import org.loculus.backend.testutil.withAuth
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put

val GROUP_REQUEST = GroupRequest(
    groupName = "v1Group",
    institution = "v1Institution",
    address = GroupAddress(
        line1 = "v1AddressLine1",
        line2 = "v1AddressLine2",
        city = "v1City",
        state = "v1State",
        postalCode = "v1PostalCode",
        country = "v1Country",
    ),
    contactEmail = "v1@loculus.org",
)

class GroupClient(private val mockMvc: MockMvc, private val objectMapper: ObjectMapper) {
    fun getGroups(name: String? = null, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/v1/groups")
            .apply { if (name != null) param("name", name) }
            .withAuth(jwt),
    )

    fun createGroup(group: GroupRequest = GROUP_REQUEST, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            post("/v1/groups")
                .contentType(MediaType.APPLICATION_JSON_VALUE)
                .content(objectMapper.writeValueAsString(group))
                .withAuth(jwt),
        )

    fun getGroup(groupId: Int, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/v1/groups/$groupId").withAuth(jwt),
    )

    fun updateGroup(
        groupId: Int,
        group: GroupRequest = GROUP_REQUEST,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        put("/v1/groups/$groupId")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(objectMapper.writeValueAsString(group))
            .withAuth(jwt),
    )

    fun getMembers(groupId: Int, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/v1/groups/$groupId/members").withAuth(jwt),
    )

    fun addMember(groupId: Int, username: String, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        put("/v1/groups/$groupId/members/$username").withAuth(jwt),
    )

    fun removeMember(groupId: Int, username: String, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        delete("/v1/groups/$groupId/members/$username").withAuth(jwt),
    )

    fun getMyGroups(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/v1/me/groups").withAuth(jwt),
    )
}

fun ResultActions.andGetGroupId(): Int = andReturn()
    .response
    .contentAsString
    .let { JsonPath.read(it, "\$.groupId") }!!
