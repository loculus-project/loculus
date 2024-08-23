package org.loculus.backend.controller.seqsetcitations

import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.SeqSetCitationsConstants
import org.loculus.backend.controller.EndpointTest
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
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Accessions ABCD do not exist"),
                ),
            )

        val accessionVersionJson = """[{"accession": "ABCD.1", "type": "loculus"}]"""
        client.validateSeqSetRecords(seqSetRecords = accessionVersionJson)
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
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
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "Accession versions must be integers",
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
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "Accession versions are in not in one of the states [APPROVED_FOR_RELEASE]",
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
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
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
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet name must not be empty"),
                ),
            )
        client.updateSeqSet(seqSetName = "")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
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
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
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
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet must contain at least one record"),
                ),
            )
        client.updateSeqSet(seqSetRecords = "[]")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet must contain at least one record"),
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
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                ).value(
                    "User exceeded limit of ${SeqSetCitationsConstants.DOI_WEEKLY_RATE_LIMIT} DOIs created per week.",
                ),
            )
    }
}
