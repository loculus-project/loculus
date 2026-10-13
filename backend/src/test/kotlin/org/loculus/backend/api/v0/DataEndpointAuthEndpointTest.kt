package org.loculus.backend.api.v0

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.v0.groups.GroupManagementControllerClient
import org.loculus.backend.api.v0.groups.andGetGroupId
import org.loculus.backend.api.v0.submission.SubmissionConvenienceClient
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.generateJwtFor
import org.loculus.backend.types.Status
import org.loculus.backend.utils.Accession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

private val gatedGetEndpoints = listOf(
    "/dummyOrganism/get-released-data",
    "/data-use-terms/LOC_0001",
    "/get-seqset",
    "/get-seqset-records",
    "/get-seqset-citations",
    "/get-sequence-citations",
    "/get-author",
    "/files/get/some-file",
    "/groups/1234",
)

private val gatedHeadEndpoints = listOf(
    "/files/get/some-file",
)

/**
 * With `loculus.security.require-data-endpoint-auth=true`, the public data endpoints
 * require any valid JWT (no role check), while infrastructure endpoints stay public.
 */
@EndpointTest(properties = ["loculus.security.require-data-endpoint-auth=true"])
class DataEndpointAuthEnabledEndpointTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    private lateinit var releasedAccession: Accession
    private var groupId: Int = 0

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } answers {
            listOf(UserRepresentation().apply { username = firstArg<String>().lowercase() })
        }
        releasedAccession = convenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)
            .first()
            .accession
        groupId = groupManagementClient.createNewGroup().andGetGroupId()
    }

    @Test
    fun `anonymous GET requests on gated data endpoints are rejected with 401`() {
        mockMvc.perform(get("/dummyOrganism/get-released-data")).andExpect(status().isUnauthorized)
        mockMvc.perform(get("/data-use-terms/$releasedAccession")).andExpect(status().isUnauthorized)
        mockMvc.perform(get("/groups/$groupId")).andExpect(status().isUnauthorized)
    }

    @ParameterizedTest
    @MethodSource("gatedGetEndpointsWithoutData")
    fun `all gated GET endpoints are rejected for anonymous requests`(path: String) {
        mockMvc.perform(get(path)).andExpect(status().isUnauthorized)
    }

    @ParameterizedTest
    @MethodSource("gatedHeadEndpoints")
    fun `all gated HEAD endpoints are rejected for anonymous requests`(path: String) {
        mockMvc.perform(head(path)).andExpect(status().isUnauthorized)
    }

    @Test
    fun `a JWT without any roles is sufficient - no role check is performed`() {
        val tokenWithoutRoles = generateJwtFor("realmUserWithoutRoles")
        mockMvc.perform(get("/dummyOrganism/get-released-data").header("Authorization", "Bearer $tokenWithoutRoles"))
            .andExpect(status().isOk)
        mockMvc.perform(get("/data-use-terms/$releasedAccession").header("Authorization", "Bearer $tokenWithoutRoles"))
            .andExpect(status().isOk)
        mockMvc.perform(get("/groups/$groupId").header("Authorization", "Bearer $tokenWithoutRoles"))
            .andExpect(status().isOk)
    }

    @Test
    fun `infrastructure endpoints stay public`() {
        mockMvc.perform(get("/")).andExpect(status().isOk)
        mockMvc.perform(get("/actuator/health")).andExpect(status().isOk)
        mockMvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk)
        mockMvc.perform(options("/dummyOrganism/get-released-data")).andExpect(status().isOk)
    }

    companion object {
        @JvmStatic
        fun gatedGetEndpointsWithoutData(): List<String> = gatedGetEndpoints

        @JvmStatic
        fun gatedHeadEndpoints(): List<String> = gatedHeadEndpoints
    }
}

/**
 * Default (`loculus.security.require-data-endpoint-auth=false`): the data endpoints
 * stay anonymous, i.e. behaviour is unchanged.
 */
@EndpointTest
class DataEndpointAuthDisabledEndpointTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    private lateinit var releasedAccession: Accession

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } answers {
            listOf(UserRepresentation().apply { username = firstArg<String>().lowercase() })
        }
        releasedAccession = convenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)
            .first()
            .accession
    }

    @Test
    fun `anonymous requests on data endpoints are allowed when the flag is disabled`() {
        mockMvc.perform(get("/dummyOrganism/get-released-data")).andExpect(status().isOk)
        mockMvc.perform(get("/data-use-terms/$releasedAccession")).andExpect(status().isOk)
    }

    @Test
    fun `OPTIONS requests are allowed`() {
        mockMvc.perform(options("/dummyOrganism/get-released-data")).andExpect(status().isOk)
    }

    @Test
    fun `a JWT without any roles still works`() {
        val tokenWithoutRoles = generateJwtFor("realmUserWithoutRoles")
        mockMvc.perform(get("/dummyOrganism/get-released-data").header("Authorization", "Bearer $tokenWithoutRoles"))
            .andExpect(status().isOk)
    }
}
