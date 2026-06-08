package org.loculus.backend

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.hamcrest.core.StringContains.containsString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class SwaggerUiTest(@Autowired val mockMvc: MockMvc) {

    @Test
    fun `Swagger UI endpoint is reachable`() {
        mockMvc.perform(get("/swagger-ui/index.html"))
            .andExpect(status().isOk)
            .andExpect(content().contentType("text/html"))
            .andExpect(content().string(containsString("Swagger UI")))
    }

    @Test
    fun `JSON API docs are available`() {
        mockMvc.perform(get("/api-docs"))
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/json"))
            .andExpect(jsonPath("\$.openapi").exists())
            .andExpect(jsonPath("\$.paths./{organism}/submit").exists())
    }

    @Test
    fun `YAML API docs are available`() {
        val result = mockMvc.perform(get("/api-docs.yaml"))
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/vnd.oai.openapi"))
            .andReturn()

        val objectMapper = ObjectMapper(YAMLFactory()).registerKotlinModule()
        val yaml = objectMapper.readTree(result.response.contentAsString)
        assertTrue(yaml.has("openapi"))
        assertTrue(yaml.get("paths").has("/{organism}/submit"))
    }

    @Test
    fun `query API docs expose organism-specific path parameter and body choices`() {
        val result = mockMvc.perform(get("/api-docs"))
            .andExpect(status().isOk)
            .andReturn()

        val json = ObjectMapper().registerKotlinModule().readTree(result.response.contentAsString)
        val paths = json.get("paths")
        val metadataOperation = paths.get("/query/dummyOrganism/{versionGroup}/metadata").get("post")
        val metadataGetOperation = paths.get("/query/dummyOrganism/{versionGroup}/metadata").get("get")
        val aggregatedGetOperation = paths.get("/query/dummyOrganism/{versionGroup}/aggregated").get("get")
        val sequenceOperation = paths.get("/query/dummyOrganism/{versionGroup}/sequences").get("post")
        val sequenceGetOperation = paths.get("/query/dummyOrganism/{versionGroup}/sequences").get("get")
        val mutationOperation = paths.get("/query/dummyOrganism/{versionGroup}/sequencesAligned/mutations").get("post")
        val mutationGetOperation = paths.get(
            "/query/dummyOrganism/{versionGroup}/sequencesAligned/mutations",
        ).get("get")

        assertTrue(!paths.has("/query/{organism}/{versionGroup}/metadata"))
        assertEquals("Query metadata", metadataOperation.get("summary").asText())
        assertEquals(listOf("Query: dummyOrganism"), metadataOperation.get("tags").map { it.asText() })
        assertTrue(
            json.get("tags").last().get("name").asText() == "lapis-proxy-controller",
        )
        assertEquals(
            "This is temporary and used for calls that have not yet switched to using the new query API.",
            json.get("tags").last().get("description").asText(),
        )
        assertTrue(
            metadataOperation.get("parameters")
                .filter { it.get("name").asText() == "x-request-id" }
                .all { !it.has("example") },
        )
        assertEquals(
            listOf("current", "allVersions"),
            findParameter(metadataOperation, "versionGroup").get("schema").get("enum").map { it.asText() },
        )
        assertTrue(metadataOperation.get("parameters").none { it.get("name").asText() == "organism" })
        assertEquals(
            listOf(
                "date",
                "dateSubmitted",
                "region",
                "country",
                "division",
                "host",
                "age",
                "sex",
                "pangoLineage",
                "qc",
                "booleanColumn",
                "insdcAccessionFull",
                "other_db_accession",
            ),
            fieldEnum(metadataOperation),
        )
        assertTrue(bodyProperties(metadataOperation).has("advancedQuery"))
        assertTrue(bodyProperties(metadataOperation).has("orderBy"))
        assertTrue(bodyProperties(metadataOperation).has("date"))
        assertEquals(
            listOf("JSON", "CSV", "CSV-WITHOUT-HEADERS", "TSV", "TSV-ESCAPED"),
            bodyPropertyEnum(metadataOperation, "dataFormat"),
        )
        assertEquals(listOf("FASTA", "JSON", "NDJSON"), bodyPropertyEnum(sequenceOperation, "dataFormat"))
        assertTrue(bodyProperties(sequenceOperation).has("fastaHeaderTemplate"))
        assertTrue(bodyProperties(sequenceOperation).has("compression"))
        assertTrue(bodyProperties(mutationOperation).has("minProportion"))
        assertEquals(
            listOf("JSON", "CSV", "CSV-WITHOUT-HEADERS", "TSV", "TSV-ESCAPED"),
            bodyPropertyEnum(mutationOperation, "dataFormat"),
        )
        assertTrue(bodyProperties(metadataOperation).has("dateFrom"))
        assertTrue(bodyProperties(metadataOperation).has("dateTo"))
        assertTrue(bodyProperties(metadataOperation).has("date.isNull"))
        assertTrue(bodyProperties(metadataOperation).has("region.regex"))
        assertTrue(bodyProperties(metadataOperation).has("nucleotideMutations"))

        assertEquals(
            listOf("JSON", "CSV", "CSV-WITHOUT-HEADERS", "TSV", "TSV-ESCAPED"),
            queryParameterEnum(metadataGetOperation, "dataFormat"),
        )
        assertTrue(
            queryParameterNames(metadataGetOperation).containsAll(listOf("compression", "downloadAsFile", "orderBy")),
        )
        assertTrue(
            queryParameterNames(
                metadataGetOperation,
            ).containsAll(listOf("country", "country.regex", "dateFrom", "dateTo", "date.isNull")),
        )
        assertTrue(queryParameterNames(metadataGetOperation).none { it == "Accept" })
        assertTrue(!queryParameterNames(metadataGetOperation).contains("fastaHeaderTemplate"))

        assertEquals(listOf("FASTA", "JSON", "NDJSON"), queryParameterEnum(sequenceGetOperation, "dataFormat"))
        assertTrue(
            queryParameterNames(
                sequenceGetOperation,
            ).containsAll(listOf("compression", "fastaHeaderTemplate", "orderBy", "country", "dateFrom")),
        )
        assertTrue(!queryParameterNames(sequenceGetOperation).contains("fields"))
        assertTrue(!queryParameterNames(sequenceGetOperation).contains("segments"))
        assertEquals(
            listOf("JSON", "CSV", "CSV-WITHOUT-HEADERS", "TSV", "TSV-ESCAPED"),
            queryParameterEnum(aggregatedGetOperation, "dataFormat"),
        )
        assertTrue(queryParameterNames(aggregatedGetOperation).containsAll(listOf("fields", "country", "dateFrom")))
        assertEquals(
            listOf("JSON", "CSV", "CSV-WITHOUT-HEADERS", "TSV", "TSV-ESCAPED"),
            queryParameterEnum(mutationGetOperation, "dataFormat"),
        )
        assertTrue(queryParameterNames(mutationGetOperation).containsAll(listOf("minProportion", "fields", "country")))
        assertTrue(!queryParameterNames(mutationGetOperation).contains("fastaHeaderTemplate"))
        assertEquals(
            listOf(
                "date",
                "dateSubmitted",
                "region",
                "specialOtherField",
                "country",
                "division",
                "host",
                "age",
                "sex",
                "pangoLineage",
                "qc",
            ),
            fieldEnum(paths.get("/query/otherOrganism/{versionGroup}/metadata").get("post")),
        )
        assertTrue(
            queryParameterNames(
                paths.get("/query/otherOrganism/{versionGroup}/metadata").get("get"),
            ).contains("specialOtherField"),
        )

        assertEquals(
            listOf("notOnlySegment", "secondSegment"),
            findParameter(
                paths.get("/query/otherOrganism/{versionGroup}/sequences/{segment}").get("post"),
                "segment",
            ).get("schema").get("enum").map { it.asText() },
        )
        assertEquals(
            listOf("someLongGene", "someShortGene"),
            findParameter(
                paths.get("/query/dummyOrganism/{versionGroup}/translations/{geneName}").get("post"),
                "geneName",
            ).get("schema").get("enum").map { it.asText() },
        )
        assertEquals(
            listOf("main"),
            findParameter(
                paths.get("/query/dummyOrganism/{versionGroup}/sequencesAligned/{referenceName}").get("post"),
                "referenceName",
            ).get("schema").get("enum").map { it.asText() },
        )
        assertTrue(paths.has("/query/otherOrganism/{versionGroup}/sequences/{segment}"))
        assertTrue(!paths.has("/query/otherOrganism/{versionGroup}/sequencesAligned/{referenceName}"))
        assertTrue(!paths.has("/query/dummyOrganismWithoutConsensusSequences/{versionGroup}/translations/{geneName}"))
    }

    private fun findParameter(operation: JsonNode, name: String) =
        operation.get("parameters").first { it.get("name").asText() == name }

    private fun fieldEnum(operation: JsonNode) = operation.get("requestBody")
        .get("content")
        .get("application/json")
        .get("schema")
        .get("properties")
        .get("fields")
        .get("items")
        .get("enum")
        .map { it.asText() }

    private fun bodyProperties(operation: JsonNode) = operation.get("requestBody")
        .get("content")
        .get("application/json")
        .get("schema")
        .get("properties")

    private fun bodyPropertyEnum(operation: JsonNode, property: String) =
        bodyProperties(operation).get(property).get("enum").map { it.asText() }

    private fun queryParameterNames(operation: JsonNode) = operation.get("parameters").map { it.get("name").asText() }

    private fun queryParameterEnum(operation: JsonNode, name: String) =
        findParameter(operation, name).get("schema").get("enum").map { it.asText() }
}
