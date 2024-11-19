package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.ApproveDataScope.ALL
import org.loculus.backend.api.ApproveDataScope.WITHOUT_WARNINGS
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.PROCESSED
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_USER_NAME
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertHasError
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.jsonContainsAccessionVersionsInAnyOrder
import org.loculus.backend.controller.jwtForSuperUser
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
                scope = ALL,
                emptyList(),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN sequence entries are processed WHEN I approve them THEN their status should be APPROVED_FOR_RELEASE`() {
        val accessionVersions = convenienceClient.prepareDataTo(PROCESSED).getAccessionVersions()

        client.approveProcessedSequenceEntries(scope = ALL, accessionVersions)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonContainsAccessionVersionsInAnyOrder(accessionVersions))

        assertThat(
            convenienceClient.getSequenceEntries().statusCounts[APPROVED_FOR_RELEASE],
            `is`(NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `GIVEN revoked sequence entries awaiting approval THEN their status should be APPROVED_FOR_RELEASE`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation()

        client.approveProcessedSequenceEntries(scope = ALL, accessionVersions)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonContainsAccessionVersionsInAnyOrder(accessionVersions))

        assertThat(
            convenienceClient.getSequenceEntries().statusCounts[APPROVED_FOR_RELEASE],
            `is`(2 * NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `WHEN I approve without accession filter or with full scope THEN all data is approved`() {
        val accessionVersions = convenienceClient.prepareDataTo(PROCESSED)

        client.approveProcessedSequenceEntries(scope = ALL)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonContainsAccessionVersionsInAnyOrder(accessionVersions))

        assertThat(
            convenienceClient.getSequenceEntriesOfUserInState(status = APPROVED_FOR_RELEASE),
            hasSize(NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `WHEN I approve sequence entries as non-group member THEN it should fail as forbidden`() {
        val accessionVersions = convenienceClient.prepareDataTo(PROCESSED).getAccessionVersions()

        client.approveProcessedSequenceEntries(scope = ALL, accessionVersions, jwt = generateJwtFor("other user"))
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString("is not a member of group"),
                ),
            )
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString("Affected AccessionVersions"),
                ),
            )
    }

    @Test
    fun `WHEN I approve a sequence entry that does not exist THEN no accession should be approved`() {
        val nonExistentAccession = "999"

        val processedAccessionVersion = convenienceClient.prepareDataTo(PROCESSED).getAccessionVersions().first()

        client.approveProcessedSequenceEntries(
            scope = ALL,
            listOf(
                processedAccessionVersion,
                AccessionVersion(nonExistentAccession, 1),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.detail", containsString("Accession versions $nonExistentAccession.1 do not exist")))

        convenienceClient.getSequenceEntry(processedAccessionVersion).assertStatusIs(PROCESSED)
    }

    @Test
    fun `WHEN I approve a sequence entry that does not exist THEN no sequence should be approved`() {
        val accessionVersions = convenienceClient.prepareDataTo(PROCESSED).getAccessionVersions()
        val nonExistingVersion = accessionVersions[1].copy(version = 999L)
        val processedAccessionVersion = accessionVersions.first()

        client.approveProcessedSequenceEntries(
            scope = ALL,
            listOf(
                processedAccessionVersion,
                nonExistingVersion,
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString(
                        "Accession versions ${nonExistingVersion.displayAccessionVersion()} " +
                            "do not exist",
                    ),
                ),
            )

        convenienceClient.getSequenceEntry(processedAccessionVersion).assertStatusIs(PROCESSED).assertHasError(false)
    }

    @Test
    fun `GIVEN one of the entries is not processed WHEN I approve them THEN no sequence should be approved`() {
        val accessionVersionsInCorrectState = convenienceClient.prepareDataTo(PROCESSED).getAccessionVersions()
        val accessionVersionNotInCorrectState = convenienceClient.prepareDataTo(IN_PROCESSING).getAccessionVersions()

        convenienceClient.getSequenceEntry(accessionVersionsInCorrectState.first())
            .assertStatusIs(PROCESSED)
        convenienceClient.getSequenceEntry(accessionVersionNotInCorrectState.first()).assertStatusIs(
            IN_PROCESSING,
        )

        client.approveProcessedSequenceEntries(
            scope = ALL,
            accessionVersionsInCorrectState + accessionVersionNotInCorrectState,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString(
                        "Accession versions are in not in one of the states " +
                            "[$PROCESSED]: " +
                            "${accessionVersionNotInCorrectState.first().displayAccessionVersion()} - $IN_PROCESSING",
                    ),
                ),
            )

        convenienceClient.getSequenceEntry(accessionVersionsInCorrectState.first())
            .assertStatusIs(PROCESSED)
            .assertHasError(false)
        convenienceClient.getSequenceEntry(accessionVersionNotInCorrectState.first()).assertStatusIs(
            IN_PROCESSING,
        )
    }

    @Test
    fun `WHEN I approve sequence entries of different organisms THEN request should be rejected`() {
        val defaultOrganismData = convenienceClient.prepareDataTo(PROCESSED, organism = DEFAULT_ORGANISM)
        val otherOrganismData = convenienceClient.prepareDataTo(PROCESSED, organism = OTHER_ORGANISM)

        client.approveProcessedSequenceEntries(
            scope = ALL,
            defaultOrganismData.getAccessionVersions() + otherOrganismData.getAccessionVersions(),
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath("$.detail")
                    .value(containsString("accession versions are not of organism otherOrganism")),
            )

        convenienceClient.getSequenceEntry(
            accession = defaultOrganismData.first().accession,
            version = 1,
            organism = DEFAULT_ORGANISM,
        )
            .assertStatusIs(PROCESSED)
            .assertHasError(false)
        convenienceClient.getSequenceEntry(
            accession = otherOrganismData.first().accession,
            version = 1,
            organism = OTHER_ORGANISM,
        )
            .assertStatusIs(PROCESSED)
            .assertHasError(false)
    }

    @Test
    fun `GIVEN multiple organisms WHEN I approve all sequences THEN approved only sequences of that organism`() {
        val defaultOrganismData = convenienceClient.prepareDataTo(PROCESSED, organism = DEFAULT_ORGANISM)
        val otherOrganismData = convenienceClient.prepareDataTo(PROCESSED, organism = OTHER_ORGANISM)

        client.approveProcessedSequenceEntries(
            scope = ALL,
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonContainsAccessionVersionsInAnyOrder(otherOrganismData))

        convenienceClient.getSequenceEntry(
            accession = defaultOrganismData.first().accession,
            version = 1,
            organism = DEFAULT_ORGANISM,
        )
            .assertStatusIs(PROCESSED)
            .assertHasError(false)
        convenienceClient.getSequenceEntry(
            accession = otherOrganismData.first().accession,
            version = 1,
            organism = OTHER_ORGANISM,
        )
            .assertStatusIs(APPROVED_FOR_RELEASE)
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

        client.approveProcessedSequenceEntries(scope = WITHOUT_WARNINGS)
            .andExpect(status().isOk)

        convenienceClient.getSequenceEntry(accession = accessionOfDataWithWarnings, version = 1)
            .assertStatusIs(PROCESSED)
            .assertHasError(false)
        convenienceClient.getSequenceEntry(accession = accessionOfSuccessfullyProcessedData, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)

        client.approveProcessedSequenceEntries(scope = ALL)
            .andExpect(status().isOk)

        convenienceClient.getSequenceEntry(accession = accessionOfDataWithWarnings, version = 1)
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
            scope = WITHOUT_WARNINGS,
            accessionVersionsFilter = listOf(
                AccessionVersion(accessionOfDataWithWarnings, 1),
                AccessionVersion(accessionOfSuccessfullyProcessedData, 1),
            ),
        )
            .andExpect(status().isOk)

        convenienceClient.getSequenceEntry(accession = accessionOfDataWithWarnings, version = 1)
            .assertStatusIs(PROCESSED)
        convenienceClient.getSequenceEntry(accession = accessionOfSuccessfullyProcessedData, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)
        convenienceClient.getSequenceEntry(accession = accessionOfAnotherSuccessfullyProcessedData, version = 1)
            .assertStatusIs(PROCESSED)
    }

    @Test
    fun `WHEN approving sequences with errors THEN an error is raised`() {
        val submittedSequences =
            convenienceClient.prepareDefaultSequenceEntriesToInProcessing()
        val accessionOfDataWithErrors = submittedSequences[0].accession
        convenienceClient.submitProcessedData(
            PreparedProcessedData.withErrors(accession = accessionOfDataWithErrors),
        )

        client.approveProcessedSequenceEntries(
            scope = WITHOUT_WARNINGS,
            accessionVersionsFilter = listOf(AccessionVersion(accessionOfDataWithErrors, 1)),
        )
            .andExpect(status().isUnprocessableEntity)

        convenienceClient.getSequenceEntry(accession = accessionOfDataWithErrors, version = 1)
            .assertStatusIs(PROCESSED)
    }

    @Test
    fun `WHEN superuser approves all entries THEN is successfully approved`() {
        val accessionVersions = convenienceClient
            .prepareDataTo(
                PROCESSED,
                username = DEFAULT_USER_NAME,
            ) +
            convenienceClient.prepareDataTo(
                PROCESSED,
                username = DEFAULT_USER_NAME,
            )

        client.approveProcessedSequenceEntries(scope = ALL, jwt = jwtForSuperUser)
            .andExpect(status().isOk)
            .andExpect(jsonContainsAccessionVersionsInAnyOrder(accessionVersions))

        convenienceClient.getSequenceEntry(accessionVersions.first()).assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    fun `WHEN user approves with submitterNamesFilter THEN only approves entries from submitter in filter`() {
        val accessionVersions = convenienceClient.prepareDataTo(
            PROCESSED,
            username = DEFAULT_USER_NAME,
        ).getAccessionVersions()
        val accessionVersionsOtherUser = convenienceClient.prepareDataTo(
            PROCESSED,
            username = ALTERNATIVE_DEFAULT_USER_NAME,
        ).getAccessionVersions()

        client.approveProcessedSequenceEntries(
            scope = ALL,
            submitterNamesFilter = listOf(DEFAULT_USER_NAME),
        )
            .andExpect(status().isOk)
            .andExpect(jsonContainsAccessionVersionsInAnyOrder(accessionVersions))

        convenienceClient.getSequenceEntry(accessionVersions.first()).assertStatusIs(APPROVED_FOR_RELEASE)
        convenienceClient.getSequenceEntry(
            accessionVersionsOtherUser.first(),
            userName = ALTERNATIVE_DEFAULT_USER_NAME,
        ).assertStatusIs(PROCESSED)
    }

    @Test
    fun `WHEN superuser approves entries of other user THEN is successfully approved`() {
        val accessionVersions = convenienceClient.prepareDataTo(
            PROCESSED,
            username = DEFAULT_USER_NAME,
        )

        client.approveProcessedSequenceEntries(
            scope = ALL,
            accessionVersionsFilter = accessionVersions,
            jwt = jwtForSuperUser,
        )
            .andExpect(status().isOk)
            .andExpect(jsonContainsAccessionVersionsInAnyOrder(accessionVersions))

        convenienceClient.getSequenceEntry(accessionVersions.first()).assertStatusIs(APPROVED_FOR_RELEASE)
    }
}
