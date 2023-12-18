package org.pathoplexus.backend.controller.groupmanagement

import org.hamcrest.CoreMatchers.`is`
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.controller.expectUnauthorizedResponse
import org.pathoplexus.backend.controller.submission.DEFAULT_USER_NAME
import org.pathoplexus.backend.controller.submission.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

const val DEFAULT_GROUP_NAME = "testGroup"

@EndpointTest
class GroupManagementControllerTest(
    @Autowired private val client: GroupManagementControllerClient,
) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.createNewGroup(jwt = it)
        }
    }

    @Test
    fun `GIVEN an existing group WHEN creating a group with same name THEN return 400`() {
        client.createNewGroup().andExpect(status().isNoContent)

        client.createNewGroup().andExpect(status().isBadRequest)
    }

    @Test
    fun `GIVEN a group is created WHEN I query the details THEN expect that the creator is the only member`() {
        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.getDetailsOfGroup()
            .andExpect(status().isOk)
            .andExpect { jsonPath("\$.users.size()", `is`(1)) }
            .andExpect { jsonPath("\$.users[0].name", `is`(DEFAULT_USER_NAME)) }
            .andReturn()
    }

    @Test
    fun `WHEN I query details of a non-existing group THEN expect a 404`() {
        client.getDetailsOfGroup()
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value("Group does not exist"))
            .andReturn()
    }
}
