package org.loculus.backend.controller.datasetcitations

import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
public class DatasetValidationEndpointsTest(
    @Autowired private val client: DatasetCitationsControllerClient,
    @Autowired private val submissionConvenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `WHEN calling validate dataset records with non-existing accessions THEN returns unprocessable entity`() {
        val accessionJson = """[{"accession": "ABCD", "type": "loculus"}]"""
        client.validateDatasetRecords(datasetRecords = accessionJson)
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Accessions ABCD do not exist"),
                ),
            )

        val accessionVersionJson = """[{"accession": "ABCD.1", "type": "loculus"}]"""
        client.validateDatasetRecords(datasetRecords = accessionVersionJson)
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
    fun `WHEN calling validate dataset records with invalid status accessions THEN returns unprocessable entity`() {
        val accessions = submissionConvenienceClient.prepareDefaultSequenceEntriesToInProcessing()
        val invalidAccession = accessions.first().accession
        val accessionJson = """[{"accession": "$invalidAccession", "type": "loculus"}]"""

        client.validateDatasetRecords(datasetRecords = accessionJson)
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
    fun `WHEN calling validate dataset records with valid accessions THEN returns ok`() {
        val accessions = submissionConvenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val validAccession = accessions.first().accession
        val accessionJson = """[{"accession": "$validAccession", "type": "loculus"}]"""
        client.validateDatasetRecords(accessionJson)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN writing dataset with missing name THEN returns unprocessable entity`() {
        client.createDataset(datasetName = "")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Dataset name must not be empty"),
                ),
            )
        client.updateDataset(datasetName = "")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Dataset name must not be empty"),
                ),
            )
    }

    @Test
    fun `WHEN writing dataset with missing records THEN returns unprocessable entity`() {
        client.createDataset(datasetRecords = "[]")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Dataset must contain at least one record"),
                ),
            )
        client.updateDataset(datasetRecords = "[]")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Dataset must contain at least one record"),
                ),
            )
    }
}
