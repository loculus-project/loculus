package org.loculus.api.groups

import com.jayway.jsonpath.JsonPath
import org.loculus.api.jwtForDefaultUser
import org.loculus.api.withAuth
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import tools.jackson.databind.json.JsonMapper

val DEFAULT_GROUP = GroupInput(
    groupName = "testGroup",
    institution = "testInstitution",
    address = Address(
        line1 = "testAddressLine1",
        line2 = "testAddressLine2",
        postalCode = "testPostalCode",
        city = "testCity",
        state = "testState",
        country = "testCountry",
    ),
    contactEmail = "testEmail",
)

val ALTERNATIVE_GROUP = GroupInput(
    groupName = "testGroup2",
    institution = "alternativeTestInstitution",
    address = Address(
        line1 = "alternativeTestAddressLine1",
        line2 = "alternativeTestAddressLine2",
        postalCode = "alternativeTestPostalCode",
        city = "alternativeTestCity",
        state = "alternativeTestState",
        country = "alternativeTestCountry",
    ),
    contactEmail = "alternativeTestEmail",
)

val CHANGED_GROUP = GroupInput(
    groupName = "testGroup name updated",
    institution = "Updated institution",
    address = Address(
        line1 = "Updated address line 1",
        line2 = "Updated address line 2",
        postalCode = "Updated post code",
        city = "Updated city",
        state = "Updated state",
        country = "Updated country",
    ),
    contactEmail = "Updated email",
)

class GroupClient(private val mockMvc: MockMvc, private val jsonMapper: JsonMapper) {
    fun getGroups(name: String? = null, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/v2/groups")
            .withAuth(jwt)
            .apply { if (name != null) param("name", name) },
    )

    fun createGroup(group: GroupInput = DEFAULT_GROUP, jwt: String? = jwtForDefaultUser): ResultActions =
        createGroupWithBody(jsonMapper.writeValueAsString(group), jwt)

    fun createGroupWithBody(body: String, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        post("/v2/groups")
            .withAuth(jwt)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body),
    )

    fun getGroup(groupId: Int, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(get("/v2/groups/$groupId").withAuth(jwt))

    fun updateGroup(groupId: Int, group: GroupInput, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        put("/v2/groups/$groupId")
            .withAuth(jwt)
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonMapper.writeValueAsString(group)),
    )

    fun getMembers(groupId: Int, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(get("/v2/groups/$groupId/members").withAuth(jwt))

    fun addMember(groupId: Int, username: String, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(put("/v2/groups/$groupId/members/$username").withAuth(jwt))

    fun removeMember(groupId: Int, username: String, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(delete("/v2/groups/$groupId/members/$username").withAuth(jwt))

    fun getMyGroups(jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(get("/v2/me/groups").withAuth(jwt))
}

fun ResultActions.andGetGroupId(): Int = JsonPath.read(andReturn().response.contentAsString, "\$.groupId")
