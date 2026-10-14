package org.loculus.backend.v2.groups

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.endsWith
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.NewGroup
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_GROUP
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_GROUP_NAME
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_USER_NAME
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_GROUP_CHANGED
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.jwtForAlternativeUser
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.withAuth
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.v2.V2EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType.APPLICATION_JSON
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@V2EndpointTest
class GroupControllerTest(@Autowired private val mockMvc: MockMvc) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @Test
    fun `creating a group returns it with its location and makes the creator its only member`() {
        val result = perform(post("/v2/groups").json(DEFAULT_GROUP))
            .andExpect(status().isCreated)
            .andExpect(jsonPath("\$.groupName").value(DEFAULT_GROUP_NAME))
            .andExpect(jsonPath("\$.contactEmail").value(DEFAULT_GROUP.contactEmail))
            .andReturn()
        val groupId = JsonPath.read<Int>(result.response.contentAsString, "\$.groupId")
        header().string(HttpHeaders.LOCATION, endsWith("/v2/groups/$groupId")).match(result)

        perform(get("/v2/groups/$groupId/members"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*].name", contains(DEFAULT_USER_NAME)))
    }

    @Test
    fun `anyone can get a group, but only authenticated users see its contact email`() {
        val groupId = createGroup()

        perform(get("/v2/groups/$groupId"), jwt = null)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.groupName").value(DEFAULT_GROUP_NAME))
            .andExpect(jsonPath("\$.contactEmail").isEmpty())
        perform(get("/v2/groups/$groupId"))
            .andExpect(jsonPath("\$.contactEmail").value(DEFAULT_GROUP.contactEmail))
        perform(get("/v2/groups/123456"), jwt = null)
            .andExpect(status().isNotFound)
    }

    @Test
    fun `groups are listed in order of creation and can be filtered by name, ignoring case`() {
        createGroup(DEFAULT_GROUP)
        createGroup(ALTERNATIVE_DEFAULT_GROUP)

        perform(get("/v2/groups"))
            .andExpect(jsonPath("\$[*].groupName", contains(DEFAULT_GROUP_NAME, ALTERNATIVE_DEFAULT_GROUP_NAME)))
        perform(get("/v2/groups").param("name", ALTERNATIVE_DEFAULT_GROUP_NAME.uppercase()))
            .andExpect(jsonPath("\$[*].groupName", contains(ALTERNATIVE_DEFAULT_GROUP_NAME)))
    }

    @Test
    fun `members and superusers can update a group, other users cannot`() {
        val groupId = createGroup()

        perform(put("/v2/groups/$groupId").json(DEFAULT_GROUP_CHANGED), jwt = jwtForAlternativeUser)
            .andExpect(status().isForbidden)
        perform(put("/v2/groups/$groupId").json(DEFAULT_GROUP_CHANGED))
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.groupName").value(DEFAULT_GROUP_CHANGED.groupName))
        perform(put("/v2/groups/$groupId").json(DEFAULT_GROUP), jwt = jwtForSuperUser)
            .andExpect(status().isOk)
        perform(put("/v2/groups/123456").json(DEFAULT_GROUP), jwt = jwtForSuperUser)
            .andExpect(status().isNotFound)
    }

    @Test
    fun `members can add and remove members`() {
        val groupId = createGroup()
        val newMember = "/v2/groups/$groupId/members/$ALTERNATIVE_DEFAULT_USER_NAME"

        perform(put(newMember)).andExpect(status().isNoContent)
        perform(put(newMember)).andExpect(status().isConflict)
        perform(get("/v2/groups/$groupId/members"))
            .andExpect(jsonPath("\$[*].name", contains(DEFAULT_USER_NAME, ALTERNATIVE_DEFAULT_USER_NAME)))

        perform(delete(newMember)).andExpect(status().isNoContent)
        perform(get("/v2/groups/$groupId/members"))
            .andExpect(jsonPath("\$[*].name", contains(DEFAULT_USER_NAME)))
    }

    @Test
    fun `other users cannot change the members, and unknown users cannot be added`() {
        val groupId = createGroup()

        perform(put("/v2/groups/$groupId/members/$ALTERNATIVE_DEFAULT_USER_NAME"), jwt = jwtForAlternativeUser)
            .andExpect(status().isForbidden)
        perform(delete("/v2/groups/$groupId/members/$DEFAULT_USER_NAME"), jwt = jwtForAlternativeUser)
            .andExpect(status().isForbidden)

        every { keycloakAdapter.getUsersWithName("unknown") } returns emptyList()
        perform(put("/v2/groups/$groupId/members/unknown"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `my groups are the groups I am a member of, or all groups for superusers`() {
        createGroup(DEFAULT_GROUP, jwt = jwtForDefaultUser)
        createGroup(ALTERNATIVE_DEFAULT_GROUP, jwt = jwtForAlternativeUser)

        perform(get("/v2/me/groups"))
            .andExpect(jsonPath("\$[*].groupName", contains(DEFAULT_GROUP_NAME)))
        perform(get("/v2/me/groups"), jwt = jwtForSuperUser)
            .andExpect(jsonPath("\$[*].groupName", contains(DEFAULT_GROUP_NAME, ALTERNATIVE_DEFAULT_GROUP_NAME)))
    }

    @Test
    fun `endpoints that require authentication reject requests without a valid token`() {
        val groupId = createGroup()
        val requests = listOf(
            get("/v2/groups"),
            post("/v2/groups").json(DEFAULT_GROUP),
            put("/v2/groups/$groupId").json(DEFAULT_GROUP),
            get("/v2/groups/$groupId/members"),
            put("/v2/groups/$groupId/members/$ALTERNATIVE_DEFAULT_USER_NAME"),
            delete("/v2/groups/$groupId/members/$DEFAULT_USER_NAME"),
            get("/v2/me/groups"),
        )

        for (jwt in listOf(null, "invalidToken")) {
            for (request in requests) {
                perform(request, jwt)
                    .andExpect(status().isUnauthorized)
                    .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, startsWith("Bearer")))
            }
        }
        // An invalid token is rejected on public endpoints too
        perform(get("/v2/groups/$groupId"), jwt = "invalidToken").andExpect(status().isUnauthorized)
    }

    private fun perform(request: MockHttpServletRequestBuilder, jwt: String? = jwtForDefaultUser) =
        mockMvc.perform(request.withAuth(jwt))

    private fun createGroup(group: NewGroup = DEFAULT_GROUP, jwt: String = jwtForDefaultUser): Int {
        val response = perform(post("/v2/groups").json(group), jwt)
            .andExpect(status().isCreated)
            .andReturn().response
        return JsonPath.read(response.contentAsString, "\$.groupId")
    }

    private fun MockHttpServletRequestBuilder.json(body: Any) =
        contentType(APPLICATION_JSON).content(jacksonObjectMapper().writeValueAsString(body))
}
