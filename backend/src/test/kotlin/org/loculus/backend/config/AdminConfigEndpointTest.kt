package org.loculus.backend.config

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForLoculusAdministrator
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.withAuth
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class AdminConfigEndpointTest(@Autowired val mockMvc: MockMvc, @Autowired val objectMapper: ObjectMapper) {

    private val sampleOrganismConfig = OrganismConfig(
        schema = Schema(
            organismName = "Test organism",
            metadata = listOf(
                Metadata(name = "country", type = MetadataType.STRING),
                Metadata(name = "date", type = MetadataType.DATE, required = true),
            ),
        ),
        referenceGenome = ReferenceGenome(
            nucleotideSequences = emptyList(),
            genes = emptyList(),
        ),
    )

    @Test
    fun `POST organisms requires admin auth`() {
        mockMvc.perform(get("/api/admin/config/organisms"))
            .andExpect(status().isUnauthorized)

        mockMvc.perform(get("/api/admin/config/organisms").withAuth(jwtForDefaultUser))
            .andExpect(status().isForbidden)

        mockMvc.perform(get("/api/admin/config/organisms").withAuth(jwtForSuperUser))
            .andExpect(status().isForbidden)

        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForDefaultUser)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"x"}"""),
        ).andExpect(status().isForbidden)
    }

    @Test
    fun `Create organism then list returns it as unreleased`() {
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"lassa"}"""),
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.key", equalTo("lassa")))
            .andExpect(jsonPath("$.status", equalTo("unreleased")))
            .andExpect(jsonPath("$.currentVersion").doesNotExist())
            .andExpect(jsonPath("$.deployed", equalTo(false)))

        mockMvc.perform(get("/api/admin/config/organisms").withAuth(jwtForLoculusAdministrator))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.organisms[?(@.key == 'lassa')].status", equalTo(listOf("unreleased"))))
            .andExpect(jsonPath("$.organisms[?(@.key == 'lassa')].deployed", equalTo(listOf(false))))
    }

    @Test
    fun `Duplicate create returns 409`() {
        val body = """{"key":"duplicate-key"}"""
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body),
        ).andExpect(status().isCreated)
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body),
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error", equalTo("organism_already_exists")))
    }

    @Test
    fun `Full flow - create then PUT draft then publish then public read returns v1`() {
        // Step 1: create organism
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"ebola-test"}"""),
        ).andExpect(status().isCreated)

        // Step 2: PUT draft with full config
        val putBody = mapOf("config" to sampleOrganismConfig)
        mockMvc.perform(
            put("/api/admin/config/organisms/ebola-test/draft")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(putBody)),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.revision", equalTo(1)))

        // Step 3: GET draft returns it
        mockMvc.perform(get("/api/admin/config/organisms/ebola-test/draft").withAuth(jwtForLoculusAdministrator))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.revision", equalTo(1)))
            .andExpect(jsonPath("$.config.schema.organismName", equalTo("Test organism")))

        // Step 4: Publish
        mockMvc.perform(
            post("/api/admin/config/organisms/ebola-test/publish").withAuth(jwtForLoculusAdministrator),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version", equalTo(1)))
            .andExpect(jsonPath("$.publishedAt", containsString("T")))

        // Step 5: Public read endpoint returns v1
        mockMvc.perform(get("/api/config/organisms/ebola-test"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version", equalTo(1)))
            .andExpect(jsonPath("$.publishedAt", containsString("T")))
            .andExpect(jsonPath("$.config.schema.metadata[0].name", equalTo("country")))

        // Step 6: Public listing does not include it until the runtime deployment is confirmed
        mockMvc.perform(get("/api/config/organisms"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.organisms[?(@.key == 'ebola-test')]", equalTo(emptyList<Any>())))

        // Step 7: Mark deployed after SILO/LAPIS are ready
        mockMvc.perform(
            post("/api/admin/config/organisms/ebola-test/mark-deployed").withAuth(jwtForLoculusAdministrator),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.key", equalTo("ebola-test")))
            .andExpect(jsonPath("$.deployed", equalTo(true)))

        // Step 8: Public listing now includes it
        mockMvc.perform(get("/api/config/organisms"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.organisms[?(@.key == 'ebola-test')].displayName", equalTo(listOf("Test organism"))))
            .andExpect(jsonPath("$.organisms[?(@.key == 'ebola-test')].currentVersion", equalTo(listOf(1))))
    }

    @Test
    fun `Mark deployed requires a released organism`() {
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"undeployed-draft"}"""),
        ).andExpect(status().isCreated)

        mockMvc.perform(
            post("/api/admin/config/organisms/undeployed-draft/mark-deployed").withAuth(jwtForLoculusAdministrator),
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error", equalTo("invalid_deployment_state")))
    }

    @Test
    fun `PUT draft on a released organism returns 403`() {
        // Create + publish
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"released-org"}"""),
        ).andExpect(status().isCreated)

        val putBody = mapOf("config" to sampleOrganismConfig)
        mockMvc.perform(
            put("/api/admin/config/organisms/released-org/draft")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(putBody)),
        ).andExpect(status().isOk)
        mockMvc.perform(
            post("/api/admin/config/organisms/released-org/publish").withAuth(jwtForLoculusAdministrator),
        ).andExpect(status().isOk)

        mockMvc.perform(
            put("/api/admin/config/organisms/released-org/draft")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(putBody)),
        )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error", equalTo("draft_scope_mismatch")))
    }

    @Test
    fun `Operations on a released organism - setMetadataFieldDisplay then publish bumps to v2`() {
        // Setup: create, draft, publish v1
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"ops-org"}"""),
        ).andExpect(status().isCreated)
        mockMvc.perform(
            put("/api/admin/config/organisms/ops-org/draft")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(mapOf("config" to sampleOrganismConfig))),
        ).andExpect(status().isOk)
        mockMvc.perform(
            post("/api/admin/config/organisms/ops-org/publish").withAuth(jwtForLoculusAdministrator),
        ).andExpect(status().isOk)

        // Append a setMetadataFieldDisplay op
        val opBody = """
            { "operations": [
                { "type": "setMetadataFieldDisplay",
                  "payload": { "field": "country", "displayName": "Country of origin" } }
            ] }
        """.trimIndent()
        mockMvc.perform(
            post("/api/admin/config/organisms/ops-org/draft/operations")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(opBody),
        ).andExpect(status().isOk)

        // Publish v2
        mockMvc.perform(
            post("/api/admin/config/organisms/ops-org/publish").withAuth(jwtForLoculusAdministrator),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version", equalTo(2)))
            .andExpect(jsonPath("$.previousVersion", equalTo(1)))

        // Public read shows the new displayName
        mockMvc.perform(get("/api/config/organisms/ops-org"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version", equalTo(2)))
            .andExpect(
                jsonPath(
                    "$.config.schema.metadata[?(@.name == 'country')].displayName",
                    equalTo(listOf("Country of origin")),
                ),
            )
    }

    @Test
    fun `Append ops on an unreleased organism returns 403`() {
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"unreleased-org"}"""),
        ).andExpect(status().isCreated)

        val opBody = """
            { "operations": [
                { "type": "setMetadataFieldDisplay",
                  "payload": { "field": "country", "displayName": "X" } }
            ] }
        """.trimIndent()
        mockMvc.perform(
            post("/api/admin/config/organisms/unreleased-org/draft/operations")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(opBody),
        )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error", equalTo("draft_scope_mismatch")))
    }

    @Test
    fun `Discard draft is no-op when no draft exists`() {
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"empty-draft-test"}"""),
        ).andExpect(status().isCreated)
        mockMvc.perform(
            delete("/api/admin/config/organisms/empty-draft-test/draft").withAuth(jwtForLoculusAdministrator),
        ).andExpect(status().isNoContent)
    }

    @Test
    fun `Optimistic concurrency - If-Match mismatch returns 409`() {
        // Create and put a draft (rev=1)
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"cc-test"}"""),
        ).andExpect(status().isCreated)
        mockMvc.perform(
            put("/api/admin/config/organisms/cc-test/draft")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(mapOf("config" to sampleOrganismConfig))),
        ).andExpect(status().isOk)

        // Second PUT with wrong If-Match
        mockMvc.perform(
            put("/api/admin/config/organisms/cc-test/draft")
                .withAuth(jwtForLoculusAdministrator)
                .header("If-Match", "99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(mapOf("config" to sampleOrganismConfig))),
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error", equalTo("revision_conflict")))
    }

    @Test
    fun `Instance config publish path - change branding, get v2`() {
        // Append a setInstanceBranding op
        val opBody = """
            { "operations": [
                { "type": "setInstanceBranding",
                  "payload": { "name": "Pathoplexus" } }
            ] }
        """.trimIndent()
        mockMvc.perform(
            post("/api/admin/config/instance/draft/operations")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(opBody),
        ).andExpect(status().isOk)

        // Publish
        mockMvc.perform(post("/api/admin/config/instance/publish").withAuth(jwtForLoculusAdministrator))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version", equalTo(2)))

        // Public read returns the new name
        mockMvc.perform(get("/api/config/instance"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version", equalTo(2)))
            .andExpect(jsonPath("$.config.name", equalTo("Pathoplexus")))
    }

    @Test
    fun `Unknown operation type returns 400`() {
        // Have to be on a released organism for the operations endpoint
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"unknown-op-test"}"""),
        ).andExpect(status().isCreated)
        mockMvc.perform(
            put("/api/admin/config/organisms/unknown-op-test/draft")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(mapOf("config" to sampleOrganismConfig))),
        ).andExpect(status().isOk)
        mockMvc.perform(
            post("/api/admin/config/organisms/unknown-op-test/publish").withAuth(jwtForLoculusAdministrator),
        ).andExpect(status().isOk)

        mockMvc.perform(
            post("/api/admin/config/organisms/unknown-op-test/draft/operations")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    { "operations": [
                        { "type": "doesNotExist", "payload": {} }
                    ] }
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error", equalTo("unknown_operation")))
    }

    @Test
    fun `Empty operation batch returns 400 and does not create a draft`() {
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"empty-op-test"}"""),
        ).andExpect(status().isCreated)
        mockMvc.perform(
            put("/api/admin/config/organisms/empty-op-test/draft")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(mapOf("config" to sampleOrganismConfig))),
        ).andExpect(status().isOk)
        mockMvc.perform(
            post("/api/admin/config/organisms/empty-op-test/publish").withAuth(jwtForLoculusAdministrator),
        ).andExpect(status().isOk)

        mockMvc.perform(
            post("/api/admin/config/organisms/empty-op-test/draft/operations")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"operations":[]}"""),
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error", equalTo("bad_request")))

        mockMvc.perform(get("/api/admin/config/organisms/empty-op-test/draft").withAuth(jwtForLoculusAdministrator))
            .andExpect(status().isNoContent)
    }
}
