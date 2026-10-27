package org.loculus.backend.api.v1.me

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkSpyBean
import io.mockk.every
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.identity.LoculusUsersTable
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.generateJwtFor
import org.loculus.backend.testutil.jwtForProcessingPipeline
import org.loculus.backend.testutil.withAuth
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class MeControllerTest(@Autowired private val mockMvc: MockMvc, @Autowired private val mapper: ObjectMapper) {
    @MockkSpyBean
    lateinit var config: BackendConfig

    @Test
    fun `me provisions once and exposes only public fields`() {
        val first = mockMvc.perform(get("/v1/me").withAuth()).andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store")).andReturn().response.contentAsString
        val again = mockMvc.perform(get("/v1/me").withAuth()).andExpect(status().isOk)
            .andReturn().response.contentAsString
        assertEquals(mapper.readTree(first), mapper.readTree(again))
        assertEquals(setOf("userId", "provisionedAt"), mapper.readTree(first).fieldNames().asSequence().toSet())
        transaction { assertEquals(1L, LoculusUsersTable.selectAll().count()) }
    }

    @Test
    fun `anonymous invalid and missing subject tokens do not provision`() {
        mockMvc.perform(get("/v1/me")).andExpect(status().isUnauthorized)
        mockMvc.perform(get("/v1/me").withAuth("invalid")).andExpect(status().isUnauthorized)
        for (subject in listOf(null, "   ")) {
            mockMvc.perform(get("/v1/me").withAuth(generateJwtFor("testuser", subject = subject)))
                .andExpect(status().isUnauthorized)
        }
        transaction { assertEquals(0L, LoculusUsersTable.selectAll().count()) }
    }

    @Test
    fun `service accounts can obtain a Loculus identity`() {
        mockMvc.perform(get("/v1/me").withAuth(jwtForProcessingPipeline)).andExpect(status().isOk)
    }

    @Test
    fun `v1 identity does not require a provider username but legacy authentication still does`() {
        val token = generateJwtFor("no-name", includeUsername = false)
        mockMvc.perform(get("/v1/me").withAuth(token)).andExpect(status().isOk)
        mockMvc.perform(get("/v1/groups").withAuth(token)).andExpect(status().isForbidden)
        mockMvc.perform(get("/user/groups").withAuth(token)).andExpect(status().isUnauthorized)
        transaction { assertEquals(1L, LoculusUsersTable.selectAll().count()) }
    }

    @Test
    fun `read-only mode resolves existing users but refuses new provisioning`() {
        mockMvc.perform(get("/v1/me").withAuth()).andExpect(status().isOk)
        every { config.readOnlyMode } returns true
        mockMvc.perform(get("/v1/me").withAuth()).andExpect(status().isOk)
        mockMvc.perform(get("/v1/me").withAuth(generateJwtFor("new-user")))
            .andExpect(status().isServiceUnavailable)
        transaction { assertEquals(1L, LoculusUsersTable.selectAll().count()) }
    }

    @Test
    fun `legacy endpoints do not trigger provisioning`() {
        mockMvc.perform(get("/user/groups").withAuth()).andExpect(status().isOk)
        transaction { assertEquals(0L, LoculusUsersTable.selectAll().count()) }
    }
}
