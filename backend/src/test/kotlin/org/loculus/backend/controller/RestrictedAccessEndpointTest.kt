package org.loculus.backend.controller

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(properties = ["loculus.require-authentication=true"])
class RestrictedAccessEndpointTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val groups: GroupManagementControllerClient,
    @Autowired private val submissions: SubmissionControllerClient,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun configureDirectory() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @Test
    fun `contribution capability does not bypass group membership`() {
        val groupId = groups.createNewGroup(jwt = jwtForSuperUser).andGetGroupId()
        val contributor = generateJwtFor(DEFAULT_USER_NAME, listOf("contributor"))
        submissions.submit(DefaultFiles.metadataFile, DefaultFiles.sequencesFile, groupId = groupId, jwt = contributor)
            .andExpect(status().isForbidden)
        groups.addUserToGroup(groupId, DEFAULT_USER_NAME, jwtForSuperUser).andExpect(status().isNoContent)
        submissions.submit(DefaultFiles.metadataFile, DefaultFiles.sequencesFile, groupId = groupId, jwt = contributor)
            .andExpect(status().isOk)
        submissions.getSequenceEntries(groupIdsFilter = listOf(groupId), jwt = contributor)
            .andExpect(status().isOk)
        val outsider = generateJwtFor(ALTERNATIVE_DEFAULT_USER_NAME, listOf("contributor"))
        submissions.getSequenceEntries(groupIdsFilter = listOf(groupId), jwt = outsider)
            .andExpect(status().isForbidden)
        // Membership alone never upgrades a viewer into a contributor.
        submissions.getSequenceEntries(groupIdsFilter = listOf(groupId), jwt = jwtForDefaultUser)
            .andExpect(status().isForbidden)
        groups.addUserToGroup(groupId, ALTERNATIVE_DEFAULT_USER_NAME, contributor)
            .andExpect(status().isForbidden)
        groups.removeUserFromGroup(groupId, DEFAULT_USER_NAME, contributor)
            .andExpect(status().isForbidden)
        groups.createNewGroup(jwt = contributor).andExpect(status().isForbidden)
    }

    @Test
    fun `superuser retains contribution and membership capabilities`() {
        val groupId = groups.createNewGroup(jwt = jwtForSuperUser).andGetGroupId()
        submissions.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            groupId = groupId,
            jwt = jwtForSuperUser,
        ).andExpect(status().isOk)
        mockMvc.perform(get("/access/capabilities").withAuth(jwtForSuperUser))
            .andExpect(jsonPath("$.canReadReleasedData").value(true))
            .andExpect(jsonPath("$.canContribute").value(true))
            .andExpect(jsonPath("$.canManageMembership").value(true))
    }

    @Test
    fun `viewer cannot submit even directly to the API`() {
        mockMvc.perform(post("/ebola-sudan/submit").withAuth()).andExpect(status().isForbidden)
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "/ebola-sudan/get-sequences",
            "/ebola-sudan/get-submitted-metadata",
            "/ebola-sudan/get-data-to-edit/x/1",
        ],
    )
    fun `viewer cannot read drafts`(path: String) {
        mockMvc.perform(get(path).withAuth()).andExpect(status().isForbidden)
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "/ebola-sudan/revise",
            "/ebola-sudan/approve-processed-data",
            "/ebola-sudan/revoke",
            "/create-seqset",
            "/files/request-upload",
        ],
    )
    fun `viewer cannot mutate data`(path: String) {
        mockMvc.perform(post(path).withAuth()).andExpect(status().isForbidden)
    }

    @Test
    fun `anonymous released reads require authentication`() {
        mockMvc.perform(get("/ebola-sudan/get-released-data")).andExpect(status().isUnauthorized)
    }

    @Test
    fun `capabilities use backend policy rather than group membership`() {
        mockMvc.perform(get("/access/capabilities").withAuth())
            .andExpect(status().isOk).andExpect(jsonPath("$.canContribute").value(false))
        mockMvc.perform(get("/access/capabilities").withAuth(generateJwtFor("writer", listOf("contributor"))))
            .andExpect(status().isOk).andExpect(jsonPath("$.canContribute").value(true))
    }
}
