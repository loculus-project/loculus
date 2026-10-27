package org.loculus.backend.api.v1.groups

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.ninjasquad.springmockk.MockkSpyBean
import io.mockk.every
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.groupmanagement.GroupsTable
import org.loculus.backend.service.groupmanagement.UserGroupsTable
import org.loculus.backend.service.identity.IdentityDatabaseService
import org.loculus.backend.service.identity.LoculusUsersTable
import org.loculus.backend.testutil.DEFAULT_GROUP
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.TEST_TOKEN_ISSUER
import org.loculus.backend.testutil.generateJwtFor
import org.loculus.backend.testutil.jwtForDefaultUser
import org.loculus.backend.testutil.jwtForProcessingPipeline
import org.loculus.backend.testutil.jwtForSuperUser
import org.loculus.backend.testutil.withAuth
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID

@EndpointTest
class GroupControllerTest(
    @Autowired private val mvc: MockMvc,
    @Autowired private val mapper: ObjectMapper,
    @Autowired private val identities: IdentityDatabaseService,
) {
    @MockkSpyBean
    lateinit var config: BackendConfig

    @Test
    fun `OpenAPI documents v1 parameters responses and strict request schemas`() {
        val response = mvc.perform(get("/api-docs")).andExpect(status().isOk)
            .andReturn().response.contentAsString
        val spec = mapper.readTree(response)
        val paths = spec["paths"]
        val list = paths["/v1/groups"]["get"]
        val parameters = list["parameters"].filter { it["in"].asText() == "query" }
            .associateBy { it["name"].asText() }
        assertEquals(setOf("limit", "after"), parameters.keys)
        assertEquals(1, parameters.getValue("limit")["schema"]["minimum"].asInt())
        assertEquals(100, parameters.getValue("limit")["schema"]["maximum"].asInt())
        assertEquals(50, parameters.getValue("limit")["schema"]["default"].asInt())
        assertEquals(0, parameters.getValue("after")["schema"]["minimum"].asInt())
        assertTrue(list["security"].any { it.has("bearerAuth") })
        for (code in listOf("200", "400", "401", "403", "503")) {
            assertTrue(list["responses"].has(code), "Missing list response $code")
        }
        val create = paths["/v1/groups"]["post"]
        assertTrue(create["responses"].has("201"))
        assertTrue(!create["responses"].has("200"))
        assertTrue(create["responses"]["201"]["headers"].has("Location"))
        val details = paths["/v1/groups/{groupId}"]["get"]
        assertEquals(1, details["parameters"][0]["schema"]["minimum"].asInt())
        assertTrue(details["responses"].has("404"))
        assertTrue(details["description"].asText().contains("Authentication is optional"))
        val schemas = spec["components"]["schemas"]
        for (name in listOf("CreateGroupRequest", "GroupAddressRequest")) {
            assertEquals(false, schemas[name]["additionalProperties"].asBoolean(), name)
        }
        assertEquals(255, schemas["CreateGroupRequest"]["properties"]["groupName"]["maxLength"].asInt())
        assertEquals(1, schemas["CreateGroupRequest"]["properties"]["groupName"]["minLength"].asInt())
        assertEquals(
            setOf("line1", "postalCode", "city", "country"),
            schemas["GroupAddressRequest"]["required"].map {
                it.asText()
            }.toSet(),
        )
        assertTrue(schemas["GroupPageResponse"]["properties"]["nextAfter"]["type"].any { it.asText() == "null" })
        assertTrue(schemas["GroupDetailsResponse"]["properties"]["members"]["type"].any { it.asText() == "null" })
        assertTrue(schemas["GroupPageResponse"]["properties"]["nextAfter"]["description"].asText().contains("null"))
        assertEquals("uuid", schemas["MeResponse"]["properties"]["userId"]["format"].asText())
        assertTrue(paths["/v1/me"]["get"]["responses"].has("503"))
    }

    @Test
    fun `creation returns 201 location and details and adds the creator as a member`() {
        val result = mvc.perform(
            post("/v1/groups").withAuth().contentType(MediaType.APPLICATION_JSON)
                .content(validRequest().toString()),
        )
            .andExpect(status().isCreated)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn().response
        val body = mapper.readTree(result.contentAsString)
        val id = body["groupId"].asInt()
        assertEquals("/v1/groups/$id", result.getHeader("Location"))
        assertEquals(
            setOf("groupId", "groupName", "institution", "address", "contactEmail"),
            body.fieldNames().asSequence().toSet(),
        )
        transaction {
            assertEquals(1L, GroupsTable.selectAll().count())
            val member = UserGroupsTable.selectAll().single()
            assertEquals(id, member[UserGroupsTable.groupIdColumn])
            assertEquals("testuser", member[UserGroupsTable.userNameColumn])
        }
    }

    @Test
    fun `listing is membership scoped before pagination and superusers have no bypass`() {
        val first = create()
        create(jwt = generateJwtFor("other"))
        val second = create()
        val page = response("/v1/groups?limit=1")
        assertEquals(listOf(first), page["groups"].map { it["groupId"].asInt() })
        assertEquals(first, page["nextAfter"].asInt())
        val next = response("/v1/groups?limit=1&after=$first")
        assertEquals(listOf(second), next["groups"].map { it["groupId"].asInt() })
        assertTrue(next["nextAfter"].isNull)
        assertTrue(response("/v1/groups", jwtForSuperUser)["groups"].isEmpty)
        val own = create(jwt = jwtForSuperUser)
        assertEquals(listOf(own), response("/v1/groups", jwtForSuperUser)["groups"].map { it["groupId"].asInt() })
        mvc.perform(get("/user/groups").withAuth(jwtForSuperUser))
            .andExpect(status().isOk).andExpect(jsonPath("$.length()").value(4))
    }

    @Test
    fun `details preserve public visibility and never provision identities`() {
        // Seed through the legacy endpoint, which must not provision a Loculus user.
        val legacy = mvc.perform(
            post("/groups").withAuth().contentType(MediaType.APPLICATION_JSON)
                .content(validRequest().toString()),
        ).andExpect(status().isOk).andReturn()
        val id = mapper.readTree(legacy.response.contentAsString)["groupId"].asInt()
        every { config.readOnlyMode } returns true
        mvc.perform(get("/v1/groups/$id")).andExpect(status().isOk)
            .andExpect(jsonPath("$.contactEmail").value(null as String?))
            .andExpect(jsonPath("$.members").value(null as String?))
            .andExpect(jsonPath("$.institution").value(DEFAULT_GROUP.institution))
        mvc.perform(get("/v1/groups/$id").withAuth(generateJwtFor("non-member", subject = null)))
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.contactEmail").value("contact@example.org"))
            .andExpect(jsonPath("$.members[0].username").value("testuser"))
        mvc.perform(get("/v1/groups/$id").withAuth("invalid")).andExpect(status().isUnauthorized)
        transaction { assertEquals(0L, LoculusUsersTable.selectAll().count()) }
        mvc.perform(get("/v1/groups/2147483647")).andExpect(status().isNotFound)
    }

    @Test
    fun `invalid v1 bodies including nested unknown fields are rejected before provisioning`() {
        val requests = listOf(
            validRequest().put("creatorId", "not-allowed"),
            validRequest().apply { (get("address") as ObjectNode).put("unexpected", "value") },
            validRequest().put("groupName", " "),
            validRequest().put("groupName", "x".repeat(256)),
            validRequest().put("contactEmail", "not-an-email"),
            validRequest().apply { remove("institution") },
            validRequest().apply { (get("address") as ObjectNode).put("city", "") },
            validRequest().apply { (get("address") as ObjectNode).put("line2", "x".repeat(256)) },
        )
        for (request in requests) {
            mvc.perform(
                post("/v1/groups").withAuth().contentType(MediaType.APPLICATION_JSON).content(request.toString()),
            )
                .andExpect(status().isBadRequest)
        }
        transaction {
            assertEquals(0L, GroupsTable.selectAll().count())
            assertEquals(0L, LoculusUsersTable.selectAll().count())
        }
        // Strict deserialization is not a global change.
        mvc.perform(
            post("/groups").withAuth().contentType(MediaType.APPLICATION_JSON)
                .content(validRequest().put("unknownLegacyField", true).toString()),
        ).andExpect(status().isOk)
    }

    @Test
    fun `authentication pagination read-only and service account policies are explicit`() {
        mvc.perform(get("/v1/groups")).andExpect(status().isUnauthorized)
        mvc.perform(post("/v1/groups").contentType(MediaType.APPLICATION_JSON).content(validRequest().toString()))
            .andExpect(status().is4xxClientError)
        for (query in listOf("limit=0", "limit=101", "after=-1", "limit=abc")) {
            mvc.perform(get("/v1/groups?$query").withAuth()).andExpect(status().isBadRequest)
        }
        create(jwt = jwtForProcessingPipeline)
        assertEquals(1, response("/v1/groups", jwtForProcessingPipeline)["groups"].size())
        every { config.readOnlyMode } returns true
        mvc.perform(
            post("/v1/groups").withAuth().contentType(MediaType.APPLICATION_JSON).content(validRequest().toString()),
        )
            .andExpect(status().isServiceUnavailable)
        transaction { assertEquals(1L, GroupsTable.selectAll().count()) }
    }

    @Test
    fun `stored username rather than later token snapshot controls transitional membership`() {
        val id = create()
        val originalSubject = UUID.nameUUIDFromBytes("testuser".toByteArray(Charsets.UTF_8)).toString()
        val changed = generateJwtFor("changed-name", subject = originalSubject)
        assertEquals(listOf(id), response("/v1/groups", changed)["groups"].map { it["groupId"].asInt() })
        val unnamed = identities.create(ExternalIdentity(TEST_TOKEN_ISSUER, "unnamed"), null)
        val token = generateJwtFor("token-name", subject = unnamed.externalIdentity.subject)
        mvc.perform(get("/v1/me").withAuth(token)).andExpect(status().isOk)
        mvc.perform(get("/v1/groups").withAuth(token)).andExpect(status().isForbidden)
        mvc.perform(
            post("/v1/groups").withAuth(token).contentType(MediaType.APPLICATION_JSON)
                .content(validRequest().toString()),
        ).andExpect(status().isForbidden)
        transaction { assertEquals(1L, GroupsTable.selectAll().count()) }
    }

    private fun validRequest(): ObjectNode = mapper.valueToTree<ObjectNode>(DEFAULT_GROUP)
        .put("contactEmail", "contact@example.org")

    private fun create(jwt: String = jwtForDefaultUser): Int {
        val result = mvc.perform(
            post("/v1/groups").withAuth(jwt).contentType(MediaType.APPLICATION_JSON)
                .content(validRequest().toString()),
        ).andExpect(status().isCreated).andReturn()
        return mapper.readTree(result.response.contentAsString)["groupId"].asInt()
    }

    private fun response(path: String, jwt: String = jwtForDefaultUser): JsonNode {
        val result = mvc.perform(get(path).withAuth(jwt)).andExpect(status().isOk).andReturn()
        return mapper.readTree(result.response.contentAsString)
    }
}
