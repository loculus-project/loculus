package org.loculus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.config.service.OrganismNotFoundException
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

private const val ORGANISM = DEFAULT_ORGANISM
private const val LAPIS_URL = "http://lapis.test"

@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class QueryControllerTest(@Autowired val mockMvc: MockMvc, @Autowired val objectMapper: ObjectMapper) {

    @MockkBean
    lateinit var lapisProxyService: LapisProxyService

    @MockkBean(relaxed = true)
    lateinit var configService: ConfigService

    private val okResponse: ResponseEntity<StreamingResponseBody> = ResponseEntity.ok(
        StreamingResponseBody { it.write("{}".toByteArray()) },
    )

    @BeforeEach
    fun setUp() {
        every { lapisProxyService.proxyPost(any(), any(), any(), any()) } returns okResponse
        every { lapisProxyService.proxyGet(any(), any(), any(), any()) } returns okResponse

        val organismConfig = mockk<OrganismConfig> { every { lapisUrl } returns LAPIS_URL }
        every { configService.getOrganismConfig(ORGANISM) } returns
            mockk<ConfigService.VersionedOrganism> { every { config } returns organismConfig }
        every { configService.getOrganismConfig("unknownOrganism") } throws OrganismNotFoundException("unknownOrganism")
    }

    @Test
    fun `unauthenticated request is allowed (query endpoints are open)`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isOk)
    }

    @Test
    fun `current injects versionStatus LATEST_VERSION into body`() {
        val bodySlot = slot<ByteArray>()
        every { lapisProxyService.proxyPost(any(), any(), capture(bodySlot), any()) } returns okResponse

        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"limit": 10}"""),
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
                .content("""{"limit": 5}"""),
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
                .contentType(MediaType.APPLICATION_JSON),
        ).andExpect(status().isOk)

        val forwarded = objectMapper.readTree(bodySlot.captured)
        assert(forwarded.get("versionStatus")?.asText() == "LATEST_VERSION") {
            "Expected versionStatus injected into empty body, got: $forwarded"
        }
    }

    @Test
    fun `no group visibility filter is injected (auth off)`() {
        val bodySlot = slot<ByteArray>()
        every { lapisProxyService.proxyPost(any(), any(), capture(bodySlot), any()) } returns okResponse

        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isOk)

        val forwarded = objectMapper.readTree(bodySlot.captured)
        assert(forwarded.get("groupId") == null) {
            "Expected no groupId filter in forwarded body, got: $forwarded"
        }
        assert(forwarded.get("advancedQuery") == null) {
            "Expected no advancedQuery visibility filter in forwarded body, got: $forwarded"
        }
    }

    @Test
    fun `GET query preserves advancedQuery and injects versionStatus without group filter`() {
        val querySlot = slot<String>()
        every { lapisProxyService.proxyGet(any(), any(), capture(querySlot), any()) } returns okResponse

        mockMvc.perform(
            get("/query/$ORGANISM/current/aggregated?fields=country&advancedQuery=country=Germany"),
        ).andExpect(status().isOk)

        val forwarded = URLDecoder.decode(querySlot.captured, StandardCharsets.UTF_8)
        assert(forwarded.contains("versionStatus=LATEST_VERSION")) {
            "Expected versionStatus in forwarded query, got: $forwarded"
        }
        assert(forwarded.contains("advancedQuery=country=Germany")) {
            "Expected advancedQuery preserved unchanged in forwarded query, got: $forwarded"
        }
        assert(!forwarded.contains("groupId")) {
            "Expected no groupId filter in forwarded query, got: $forwarded"
        }
    }

    @Test
    fun `unknown organism returns 404`() {
        mockMvc.perform(
            post("/query/unknownOrganism/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isNotFound)
    }

    @Test
    fun `unknown versionGroup returns 404`() {
        mockMvc.perform(
            post("/query/$ORGANISM/badVersionGroup/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isNotFound)
    }

    @Test
    fun `metadata routes to sample details`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/metadata")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(eq(LAPIS_URL), eq("/sample/details"), any(), any()) }
    }

    @Test
    fun `aggregated routes to sample aggregated`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/aggregated")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/aggregated"), any(), any()) }
    }

    @Test
    fun `aggregated GET routes to sample aggregated`() {
        mockMvc.perform(
            get("/query/$ORGANISM/current/aggregated?fields=country"),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyGet(any(), eq("/sample/aggregated"), any(), any()) }
    }

    @Test
    fun `sequencesAligned mutations routes to nucleotideMutations (literal wins over variable)`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/sequencesAligned/mutations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/nucleotideMutations"), any(), any()) }
    }

    @Test
    fun `sequencesAligned mutations GET routes to nucleotideMutations`() {
        mockMvc.perform(
            get("/query/$ORGANISM/current/sequencesAligned/mutations"),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyGet(any(), eq("/sample/nucleotideMutations"), any(), any()) }
    }

    @Test
    fun `sequencesAligned with referenceName routes to alignedNucleotideSequences with segment`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/sequencesAligned/main")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/alignedNucleotideSequences/main"), any(), any()) }
    }

    @Test
    fun `sequences with segment routes to unalignedNucleotideSequences with segment`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/sequences/main")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/unalignedNucleotideSequences/main"), any(), any()) }
    }

    @Test
    fun `translations with geneName routes to alignedAminoAcidSequences`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/translations/S")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/alignedAminoAcidSequences/S"), any(), any()) }
    }

    @Test
    fun `translations mutations routes to aminoAcidMutations`() {
        mockMvc.perform(
            post("/query/$ORGANISM/current/translations/S/mutations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isOk)

        verify { lapisProxyService.proxyPost(any(), eq("/sample/aminoAcidMutations"), any(), any()) }
    }
}
