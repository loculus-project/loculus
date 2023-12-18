package org.pathoplexus.backend.controller

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class GroupManagementControllerTest(@Autowired private val mockMvc: MockMvc) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            createNewGroup("testGroup", jwt = it)
        }
    }

    // TODO(668: verify that the group has one user after creation
    @Test
    fun `GIVEN WHEN creating a group THEN return success with 204`() {
        createNewGroup("testGroup").andExpect(status().isNoContent())
    }

    @Test
    fun `GIVEN an existing group WHEN creating a group with same name THEN return 400`() {
        createNewGroup("testGroup")

        createNewGroup("testGroup").andExpect(status().isBadRequest())
    }

    private fun createNewGroup(groupName: String, jwt: String? = jwtForDefaultUser) = mockMvc.perform(
        post("/groups/$groupName")
            .withAuth(jwt),
    )
}
