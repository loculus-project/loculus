package org.pathoplexus.backend.controller

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.Status
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class ApproveProcessedDataEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN sequence entries are processed WHEN I approve them THEN their status should be APPROVED_FOR_RELEASE`() {
        convenienceClient.prepareDatabaseWith(
            PreparedProcessedData.successfullyProcessed(accession = "1"),
            PreparedProcessedData.successfullyProcessed(accession = "2"),
        )

        client.approveProcessedSequenceEntries(
            listOf(
                AccessionVersion("1", 1),
                AccessionVersion("2", 1),
            ),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = "1", version = 1)
            .assertStatusIs(Status.APPROVED_FOR_RELEASE)
        convenienceClient.getSequenceEntryOfUser(accession = "2", version = 1)
            .assertStatusIs(Status.APPROVED_FOR_RELEASE)
    }

    @Test
    fun `WHEN I approve sequence entries of other user THEN it should fail as forbidden`() {
        convenienceClient.prepareDatabaseWith(
            PreparedProcessedData.successfullyProcessed(accession = "1"),
            PreparedProcessedData.successfullyProcessed(accession = "2"),
        )

        client.approveProcessedSequenceEntries(
            listOf(
                AccessionVersion("1", 1),
                AccessionVersion("2", 1),
            ),
            "other user",
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString("does not have right to change the accession versions 1.1, 2.1"),
                ),
            )
    }

    @Test
    fun `WHEN I approve a sequence entry that does not exist THEN no accession should be approved`() {
        val nonExistentAccession = "999"

        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed(accession = "1"))

        val existingAccessionVersion = AccessionVersion("1", 1)

        client.approveProcessedSequenceEntries(
            listOf(
                existingAccessionVersion,
                AccessionVersion(nonExistentAccession, 1),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.detail", containsString("Accession versions 999.1 do not exist")))

        convenienceClient.getSequenceEntryOfUser(existingAccessionVersion).assertStatusIs(Status.AWAITING_APPROVAL)
    }

    @Test
    fun `WHEN I approve a sequence entry that does not exist THEN no sequence should be approved`() {
        val nonExistentVersion = 999L

        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed(accession = "1"))

        val existingAccessionVersion = AccessionVersion("1", 1)

        client.approveProcessedSequenceEntries(
            listOf(
                existingAccessionVersion,
                AccessionVersion("1", nonExistentVersion),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.detail", containsString("Accession versions 1.999 do not exist")))

        convenienceClient.getSequenceEntryOfUser(existingAccessionVersion).assertStatusIs(Status.AWAITING_APPROVAL)
    }

    @Test
    fun `GIVEN one of the entries is not processed WHEN I approve them THEN no sequence should be approved`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed(accession = "1"))

        val accessionVersionInCorrectState = AccessionVersion("1", 1)

        convenienceClient.getSequenceEntryOfUser(accessionVersionInCorrectState)
            .assertStatusIs(Status.AWAITING_APPROVAL)
        convenienceClient.getSequenceEntryOfUser(accession = "2", version = 1).assertStatusIs(Status.IN_PROCESSING)

        client.approveProcessedSequenceEntries(
            listOf(
                accessionVersionInCorrectState,
                AccessionVersion("2", 1),
                AccessionVersion("3", 1),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath("$.detail")
                    .value(
                        "Accession versions are in not in one of the states [${Status.AWAITING_APPROVAL}]: " +
                            "2.1 - ${Status.IN_PROCESSING}, 3.1 - ${Status.IN_PROCESSING}",
                    ),
            )

        convenienceClient.getSequenceEntryOfUser(accessionVersionInCorrectState)
            .assertStatusIs(Status.AWAITING_APPROVAL)
        convenienceClient.getSequenceEntryOfUser(accession = "2", version = 1).assertStatusIs(Status.IN_PROCESSING)
        convenienceClient.getSequenceEntryOfUser(accession = "3", version = 1).assertStatusIs(Status.IN_PROCESSING)
    }
}
