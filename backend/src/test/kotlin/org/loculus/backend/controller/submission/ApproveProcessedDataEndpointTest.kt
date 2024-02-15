package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.ApproveDataScope
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.AWAITING_APPROVAL
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
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
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.approveProcessedSequenceEntries(
                emptyList(),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN sequence entries are processed WHEN I approve them THEN their status should be APPROVED_FOR_RELEASE`() {
        convenienceClient.prepareDatabaseWithProcessedData(
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
            .assertStatusIs(APPROVED_FOR_RELEASE)
        convenienceClient.getSequenceEntryOfUser(accession = "2", version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    fun `WHEN I approve without accession filter or with full scope THEN all data is approved`() {
        convenienceClient.prepareDataTo(AWAITING_APPROVAL)

        client.approveProcessedSequenceEntries(scope = ApproveDataScope.ALL)
            .andExpect(status().isNoContent)

        assertThat(
            convenienceClient.getSequenceEntriesOfUserInState(status = APPROVED_FOR_RELEASE),
            hasSize(NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `WHEN I approve sequence entries as non-group member THEN it should fail as forbidden`() {
        convenienceClient.prepareDatabaseWithProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = "1"),
            PreparedProcessedData.successfullyProcessed(accession = "2"),
        )

        client.approveProcessedSequenceEntries(
            listOf(
                AccessionVersion("1", 1),
                AccessionVersion("2", 1),
            ),
            jwt = generateJwtFor("other user"),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString("is not a member of the group"),
                ),
            )
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString("Affected AccessionVersions: [1.1, 2.1]"),
                ),
            )
    }

    @Test
    fun `WHEN I approve a sequence entry that does not exist THEN no accession should be approved`() {
        val nonExistentAccession = "999"

        convenienceClient.prepareDatabaseWithProcessedData(PreparedProcessedData.successfullyProcessed(accession = "1"))

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

        convenienceClient.getSequenceEntryOfUser(existingAccessionVersion).assertStatusIs(AWAITING_APPROVAL)
    }

    @Test
    fun `WHEN I approve a sequence entry that does not exist THEN no sequence should be approved`() {
        val nonExistentVersion = 999L

        convenienceClient.prepareDatabaseWithProcessedData(PreparedProcessedData.successfullyProcessed(accession = "1"))

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

        convenienceClient.getSequenceEntryOfUser(existingAccessionVersion).assertStatusIs(AWAITING_APPROVAL)
    }

    @Test
    fun `GIVEN one of the entries is not processed WHEN I approve them THEN no sequence should be approved`() {
        convenienceClient.prepareDatabaseWithProcessedData(PreparedProcessedData.successfullyProcessed(accession = "1"))

        val accessionVersionInCorrectState = AccessionVersion("1", 1)

        convenienceClient.getSequenceEntryOfUser(accessionVersionInCorrectState)
            .assertStatusIs(AWAITING_APPROVAL)
        convenienceClient.getSequenceEntryOfUser(accession = "2", version = 1).assertStatusIs(IN_PROCESSING)

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
                        "Accession versions are in not in one of the states [$AWAITING_APPROVAL]: " +
                            "2.1 - $IN_PROCESSING, 3.1 - $IN_PROCESSING",
                    ),
            )

        convenienceClient.getSequenceEntryOfUser(accessionVersionInCorrectState)
            .assertStatusIs(AWAITING_APPROVAL)
        convenienceClient.getSequenceEntryOfUser(accession = "2", version = 1).assertStatusIs(IN_PROCESSING)
        convenienceClient.getSequenceEntryOfUser(accession = "3", version = 1).assertStatusIs(IN_PROCESSING)
    }

    @Test
    fun `WHEN I approve sequence entries of different organisms THEN request should be rejected`() {
        val defaultOrganismData = convenienceClient.prepareDataTo(AWAITING_APPROVAL, organism = DEFAULT_ORGANISM)
        val otherOrganismData = convenienceClient.prepareDataTo(AWAITING_APPROVAL, organism = OTHER_ORGANISM)

        client.approveProcessedSequenceEntries(
            defaultOrganismData.getAccessionVersions() + otherOrganismData.getAccessionVersions(),
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath("$.detail")
                    .value(containsString("accession versions are not of organism otherOrganism")),
            )

        convenienceClient.getSequenceEntryOfUser(accession = "1", version = 1, organism = DEFAULT_ORGANISM)
            .assertStatusIs(AWAITING_APPROVAL)
        convenienceClient.getSequenceEntryOfUser(accession = "11", version = 1, organism = OTHER_ORGANISM)
            .assertStatusIs(AWAITING_APPROVAL)
    }

    @Test
    fun `GIVEN data with warnings WHEN I approve with different scopes THEN data are approved depending on scope`() {
        val submittedSequences =
            convenienceClient.prepareDefaultSequenceEntriesToInProcessing()
        val accessionOfSuccessfullyProcessedData = submittedSequences[0].accession
        val accessionOfDataWithWarnings = submittedSequences[1].accession

        convenienceClient.submitProcessedData(
            PreparedProcessedData.withWarnings(accession = accessionOfDataWithWarnings),
        )
        convenienceClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessionOfSuccessfullyProcessedData),
        )

        client.approveProcessedSequenceEntries(scope = ApproveDataScope.WITHOUT_WARNINGS)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = accessionOfDataWithWarnings, version = 1)
            .assertStatusIs(AWAITING_APPROVAL)
        convenienceClient.getSequenceEntryOfUser(accession = accessionOfSuccessfullyProcessedData, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)

        client.approveProcessedSequenceEntries(scope = ApproveDataScope.ALL)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = accessionOfDataWithWarnings, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    @Suppress("ktlint:standard:max-line-length")
    fun `GIVEN data with and without warnings WHEN I approve with warnings excluded THEN only sequence without warning is approved`() {
        val submittedSequences =
            convenienceClient.prepareDefaultSequenceEntriesToInProcessing()
        val accessionOfSuccessfullyProcessedData = submittedSequences[0].accession
        val accessionOfDataWithWarnings = submittedSequences[1].accession
        val accessionOfAnotherSuccessfullyProcessedData = submittedSequences[2].accession

        convenienceClient.submitProcessedData(
            PreparedProcessedData.withWarnings(accession = accessionOfDataWithWarnings),
        )
        convenienceClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessionOfSuccessfullyProcessedData),
        )
        convenienceClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessionOfAnotherSuccessfullyProcessedData),
        )

        client.approveProcessedSequenceEntries(
            scope = ApproveDataScope.WITHOUT_WARNINGS,
            listOfSequencesToApprove = listOf(
                AccessionVersion(accessionOfDataWithWarnings, 1),
                AccessionVersion(accessionOfSuccessfullyProcessedData, 1),
            ),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = accessionOfDataWithWarnings, version = 1)
            .assertStatusIs(AWAITING_APPROVAL)
        convenienceClient.getSequenceEntryOfUser(accession = accessionOfSuccessfullyProcessedData, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)
        convenienceClient.getSequenceEntryOfUser(accession = accessionOfAnotherSuccessfullyProcessedData, version = 1)
            .assertStatusIs(AWAITING_APPROVAL)
    }
}
