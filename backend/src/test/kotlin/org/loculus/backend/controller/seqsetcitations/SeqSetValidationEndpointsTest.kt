package org.loculus.backend.controller.seqsetcitations

import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.SeqSetCitationsConstants
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.crossref.CrossRefService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SeqSetValidationEndpointsTest(
    @Autowired private val client: SeqSetCitationsControllerClient,
    @Autowired private val submissionConvenienceClient: SubmissionConvenienceClient,
) {

    @MockkBean(relaxed = true)
    lateinit var crossRefService: CrossRefService

    @BeforeEach
    fun setup() {
        every { crossRefService.postCrossRefXML(any()) } returns "SUCCESS"
    }

    @Test
    fun `WHEN calling validate seqSet records with non-existing accessions THEN returns unprocessable entity`() {
        val accessionJson = """[{"accession": "ABCD", "type": "loculus"}]"""
        client.validateSeqSetRecords(seqSetRecords = accessionJson)
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Accession versions ABCD.1 do not exist"),
                ),
            )

        val accessionVersionJson = """[{"accession": "ABCD.1", "type": "loculus"}]"""
        client.validateSeqSetRecords(seqSetRecords = accessionVersionJson)
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Accession versions ABCD.1 do not exist"),
                ),
            )
    }

    @Test
    fun `WHEN calling validate seqSet records with invalid status accessions THEN returns unprocessable entity`() {
        val accessionJson = """[{"accession": "ABCD.EF", "type": "loculus"}]"""
        client.validateSeqSetRecords(seqSetRecords = accessionJson)
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "Invalid version in accession 'ABCD.EF'",
                    ),
                ),
            )
    }

    @Test
    fun `WHEN calling validate seqSet records with invalid accession format THEN returns unprocessable entity`() {
        val accessions = submissionConvenienceClient.prepareDefaultSequenceEntriesToInProcessing()
        val invalidAccession = accessions.first().accession
        val accessionJson = """[{"accession": "$invalidAccession", "type": "loculus"}]"""

        client.validateSeqSetRecords(seqSetRecords = accessionJson)
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "Accession versions are not in one of the states [APPROVED_FOR_RELEASE]",
                    ),
                ),
            )
    }

    @Test
    fun `WHEN calling validate seqSet with duplicate accessions THEN returns unprocessable entity`() {
        val accessions = submissionConvenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val validAccession = accessions.first().accession
        val accessionJson = """[
            {"accession": "$validAccession", "type": "loculus"},
            {"accession": "$validAccession", "type": "loculus"}
        ]"""
        client.validateSeqSetRecords(seqSetRecords = accessionJson)
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet must not contain duplicate accessions"),
                ),
            )
    }

    @Test
    fun `WHEN calling validate seqSet records with valid accessions THEN returns ok`() {
        val accessions = submissionConvenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val validAccession = accessions.first().accession
        val accessionJson = """[{"accession": "$validAccession", "type": "loculus"}]"""
        client.validateSeqSetRecords(accessionJson)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN writing seqSet with missing name THEN returns unprocessable entity`() {
        client.createSeqSet(seqSetName = "")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet name must not be empty"),
                ),
            )
        client.updateSeqSet(seqSetName = "")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet name must not be empty"),
                ),
            )
    }

    @Test
    fun `WHEN updating seqSet with no changes THEN returns unprocessable entity`() {
        val accessions = submissionConvenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val validAccession = accessions.first().accession
        val accessionJson = """[{"accession": "$validAccession", "type": "loculus"}]"""
        val seqSetResult = client.createSeqSet(seqSetRecords = accessionJson)
            .andExpect(status().isOk)
            .andReturn()
        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")

        client.updateSeqSet(seqSetId = seqSetId, seqSetRecords = accessionJson)
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet update must contain at least one change"),
                ),
            )
    }

    @Test
    fun `WHEN writing seqSet with missing records THEN returns unprocessable entity`() {
        client.createSeqSet(seqSetRecords = "[]")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("No accessions provided"),
                ),
            )
        client.updateSeqSet(seqSetRecords = "[]")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("No accessions provided"),
                ),
            )
    }

    @Test
    fun `WHEN calling create seqSet DOI after exceeding rate limit THEN return 429 Too Many Requests`() {
        val accessions = submissionConvenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val validAccession = accessions.first().accession
        val accessionJson = """[{"accession": "$validAccession", "type": "loculus"}]"""

        fun createSeqSetWithDOI(accessions: String): ResultActions {
            val seqSetResult = client.createSeqSet(seqSetRecords = accessions)
                .andExpect(status().isOk)
                .andReturn()
            val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")
            return client.createSeqSetDOI(seqSetId)
        }

        for (i in 1..SeqSetCitationsConstants.DOI_WEEKLY_RATE_LIMIT) {
            createSeqSetWithDOI(accessionJson)
        }
        createSeqSetWithDOI(accessionJson)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                ).value(
                    "User exceeded limit of ${SeqSetCitationsConstants.DOI_WEEKLY_RATE_LIMIT} DOIs created per week.",
                ),
            )
    }

    @Test
    fun `WHEN creating seqSet with unversioned accession that has unreleased v2 THEN succeeds if v1 is released`() {
        // This test verifies the fix for issue #5113
        // When a user adds an unversioned accession to a seqset, it should succeed as long as v1 is released,
        // even if a newer version exists but hasn't been released yet (e.g., during revision)

        // Step 1: Create and approve v1
        val accessions = submissionConvenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val allAccessions = accessions.map { it.accession }

        // Step 2: Revise all sequences and process them, but don't approve them yet
        // This creates v2 for all in AWAITING_APPROVAL state (not released)
        submissionConvenienceClient.reviseDefaultProcessedSequenceEntries(allAccessions)
        val extractedAccessionVersions = submissionConvenienceClient.extractUnprocessedData()
        submissionConvenienceClient.submitProcessedData(
            extractedAccessionVersions
                .map { PreparedProcessedData.successfullyProcessed(accession = it.accession, version = it.version) },
        )
        // Note: We intentionally do NOT approve v2, leaving it in AWAITING_APPROVAL

        // Step 3: Try to create a seqset with the unversioned accession (first one)
        // This should succeed because v1 is released, even though v2 exists and is not released
        val accession = allAccessions.first()
        val accessionJson = """[{"accession": "$accession", "type": "loculus"}]"""
        client.createSeqSet(seqSetRecords = accessionJson)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
    }
}
