package org.loculus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

private const val ORGANISM = DEFAULT_ORGANISM

@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class QueryControllerTest(@Autowired val mockMvc: MockMvc, @Autowired val objectMapper: ObjectMapper) {

    @MockkBean
    lateinit var lapisProxyService: LapisProxyService

    @MockkBean
    lateinit var groupManagementDatabaseService: GroupManagementDatabaseService

    private val okResponse: ResponseEntity<StreamingResponseBody> = ResponseEntity.ok(
        StreamingResponseBody { it.write("{}".toByteArray()) },
    )

    @BeforeEach
    fun setUp() {
        every { lapisProxyService.proxyPost(any(), any(), any(), any()) } returns okResponse
        every { groupManagementDatabaseService.getGroupIdsOfUser(any()) } returns listOf(42)
    }

    @Test
    fun `unauthenticated request returns 401`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isUnauthorized)
    }

    @Test
    fun `current injects versionStatus LATEST_VERSION into body`() {
        val bodySlot = slot<ByteArray>()
        every { lapisProxyService.proxyPost(any(), any(), capture(bodySlot), any()) } returns okResponse

        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"limit": 10}""")
                .withAuth(),
        ).andExpect(status().isOk)

        val forwarded = objectMapper.readTree(bodySlot.captured)
        assert(forwarded.get("versionStatus")?.asText() == "LATEST_VERSION") {
            "Expected versionStatus=LATEST_VERSION in forwarded body, got: $forwarded"
        }
        assert(forwarded.get("limit")?.asInt() == 10) {
            "Expected limit=10 preserved in forwarded body, got: $forwarded"
        }
    }

    @Test
    fun `allVersions does not inject versionStatus`() {
        val bodySlot = slot<ByteArray>()
        every { lapisProxyService.proxyPost(any(), any(), capture(bodySlot), any()) } returns okResponse

        mockMvc.perform(
            post("/query/$ORGANISM/allVersions/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"limit": 5}""")
                .withAuth(),
        ).andExpect(status().isOk)

        val forwarded = objectMapper.readTree(bodySlot.captured)
        assert(forwarded.get("versionStatus") == null) {
            "Expected no versionStatus in forwarded body for allVersions, got: $forwarded"
        }
    }

    @Test
    fun `null body is handled as empty object`() {
        val bodySlot = slot<ByteArray>()
        every { lapisProxyService.proxyPost(any(), any(), capture(bodySlot), any()) } returns okResponse

        mockMvc.perform(
            post("/query/$ORGANISM/current/aggregated")
                .contentType(MediaType.APPLICATION_JSON)
                .withAuth(),
        ).andExpect(status().isOk)

        val forwarded = objectMapper.readTree(bodySlot.captured)
        assert(forwarded.get("versionStatus")?.asText() == "LATEST_VERSION") {
            "Expected versionStatus injected into empty body, got: $forwarded"
        }
    }

    @Test
    fun `regular user can query own groups`() {
        every { groupManagementDatabaseService.getGroupIdsOfUser(any()) } returns listOf(10, 20)
        val bodySlot = slot<ByteArray>()
        every { lapisProxyService.proxyPost(any(), any(), capture(bodySlot), any()) } returns okResponse

        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isOk)

        val forwarded = objectMapper.readTree(bodySlot.captured)
        assert(forwarded.get("groupId") == null) {
            "Expected no direct groupId filter in forwarded body, got: $forwarded"
        }
        assert(forwarded.get("advancedQuery")?.asText() == "(groupId=10 or groupId=20)") {
            "Expected own-group visibility filter, got: $forwarded"
        }
    }

    @Test
    fun `super user has no groupId filter injected`() {
        val bodySlot = slot<ByteArray>()
        every { lapisProxyService.proxyPost(any(), any(), capture(bodySlot), any()) } returns okResponse

        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(jwtForSuperUser),
        ).andExpect(status().isOk)

        val forwarded = objectMapper.readTree(bodySlot.captured)
        assert(forwarded.get("groupId") == null) {
            "Expected no groupId filter for super user, got: $forwarded"
        }
    }

    @Test
    fun `user with no groups cannot query any groups`() {
        every { groupManagementDatabaseService.getGroupIdsOfUser(any()) } returns emptyList()
        val bodySlot = slot<ByteArray>()
        every { lapisProxyService.proxyPost(any(), any(), capture(bodySlot), any()) } returns okResponse

        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isOk)

        val forwarded = objectMapper.readTree(bodySlot.captured)
        assert(forwarded.get("groupId") == null) {
            "Expected no direct groupId filter for user with no groups, got: $forwarded"
        }
        assert(forwarded.get("advancedQuery")?.asText() == "(groupId=-1)") {
            "Expected impossible group visibility filter for user with no groups, got: $forwarded"
        }
    }

    @Test
    fun `unknown organism returns 404`() {
        mockMvc.perform(
            post("/query/unknownOrganism/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isNotFound)
    }

    @Test
    fun `unknown versionGroup returns 404`() {
        mockMvc.perform(
            post("/query/$ORGANISM/badVersionGroup/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isNotFound)
    }

    @Test
    fun `metadata routes to sample details`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/details"), any(), any()) }
    }

    @Test
    fun `aggregated routes to sample aggregated`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/aggregated")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/aggregated"), any(), any()) }
    }

    @Test
    fun `sequencesAligned mutations routes to nucleotideMutations (literal wins over variable)`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/sequencesAligned/mutations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/nucleotideMutations"), any(), any()) }
    }

    @Test
    fun `sequencesAligned with referenceName routes to alignedNucleotideSequences with segment`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/sequencesAligned/main")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/alignedNucleotideSequences/main"), any(), any()) }
    }

    @Test
    fun `sequences with segment routes to unalignedNucleotideSequences with segment`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/sequences/main")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/unalignedNucleotideSequences/main"), any(), any()) }
    }

    @Test
    fun `translations with geneName routes to alignedAminoAcidSequences`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/translations/S")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/alignedAminoAcidSequences/S"), any(), any()) }
    }

    @Test
    fun `translations mutations routes to aminoAcidMutations`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/translations/S/mutations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .withAuth(),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/aminoAcidMutations"), any(), any()) }
    }
}
