package org.loculus.backend.controller.seqsetcitations

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class AuthorsEndpointsTest(@Autowired private val client: SeqSetCitationsControllerClient) {

    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @Test
    fun `WHEN calling get author profile of non-existing user THEN returns not found`() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf()
        client.getAuthor(username = MOCK_USERNAME)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value("Author profile $MOCK_USERNAME does not exist"))
    }

    @Test
    fun `WHEN calling get author profile of existing user THEN returns author profile`() {
        val mockUser = UserRepresentation()
        mockUser.setUsername(MOCK_USERNAME)
        mockUser.setEmail(MOCK_USER_EMAIL)
        mockUser.setFirstName(MOCK_USER_FIRST_NAME)
        mockUser.setLastName(MOCK_USER_LAST_NAME)
        mockUser.setAttributes(mapOf("university" to listOf(MOCK_USER_UNIVERSITY)))
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(mockUser)

        val emailDomain = MOCK_USER_EMAIL.split("@").last()
        client.getAuthor(username = MOCK_USERNAME)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.username").value(MOCK_USERNAME))
            .andExpect(jsonPath("\$.emailDomain").value(emailDomain))
            .andExpect(jsonPath("\$.firstName").value(MOCK_USER_FIRST_NAME))
            .andExpect(jsonPath("\$.lastName").value(MOCK_USER_LAST_NAME))
            .andExpect(jsonPath("\$.university").value(MOCK_USER_UNIVERSITY))
    }
}
