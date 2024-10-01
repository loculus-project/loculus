package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.ApproveDataScope
import org.loculus.backend.api.ApproveDataScope.ALL
import org.loculus.backend.api.ApproveDataScope.WITHOUT_WARNINGS
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.AWAITING_APPROVAL
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.accessionsInAnyOrder
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.jwtForDefaultUser
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

    fun approveAndVerify(
        scope: ApproveDataScope,
        accessionVersionsExpectation: List<AccessionVersionInterface>? = null,
        accessionVersionsFilter: List<AccessionVersionInterface>? = null,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ) {
        client.approveProcessedSequenceEntries(
            scope = scope,
            accessionVersionsFilter = accessionVersionsFilter,
            organism = organism,
            jwt = jwt,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(accessionsInAnyOrder(accessionVersionsExpectation ?: accessionVersionsFilter!!))
    }

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
        val accessionVersions = convenienceClient.prepareDataTo(AWAITING_APPROVAL)

        approveAndVerify(ALL, accessionVersions)

        assertThat(
            convenienceClient.getSequenceEntries().statusCounts[APPROVED_FOR_RELEASE],
            `is`(NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `GIVEN revoked sequence entries awaiting approval THEN their status should be APPROVED_FOR_RELEASE`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation()

        approveAndVerify(ALL, accessionVersions)

        assertThat(
            convenienceClient.getSequenceEntries().statusCounts[APPROVED_FOR_RELEASE],
            `is`(2 * NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `WHEN I approve without accession filter or with full scope THEN all data is approved`() {
        val sequencesAwaitingApproval = convenienceClient.prepareDataTo(AWAITING_APPROVAL)

        approveAndVerify(
            scope = ALL,
            accessionVersionsFilter = null,
            accessionVersionsExpectation = sequencesAwaitingApproval,
        )

        assertThat(
            convenienceClient.getSequenceEntriesOfUserInState(status = APPROVED_FOR_RELEASE),
            hasSize(NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `WHEN I approve sequence entries as non-group member THEN it should fail as forbidden`() {
        val accessionVersions = convenienceClient.prepareDataTo(AWAITING_APPROVAL)

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

        val accessionVersions = convenienceClient.prepareDataTo(AWAITING_APPROVAL)

        client.approveProcessedSequenceEntries(
            scope = ALL,
            listOf(
                accessionVersions.first(),
                AccessionVersion(nonExistentAccession, 1),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.detail", containsString("Accession versions 999.1 do not exist")))

        convenienceClient.getSequenceEntry(accessionVersions.first()).assertStatusIs(AWAITING_APPROVAL)
    }

    @Test
    fun `WHEN I approve a sequence entry that does not exist THEN no sequence should be approved`() {
        val accessionVersions = convenienceClient.prepareDataTo(AWAITING_APPROVAL).getAccessionVersions()
        val nonExistingVersion = accessionVersions[1].copy(version = 999L)

        client.approveProcessedSequenceEntries(
            scope = ALL,
            listOf(
                accessionVersions.first(),
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

        convenienceClient.getSequenceEntry(accessionVersions.first()).assertStatusIs(AWAITING_APPROVAL)
    }

    @Test
    fun `GIVEN one of the entries is not processed WHEN I approve them THEN no sequence should be approved`() {
        val accessionVersionsInCorrectState = convenienceClient.prepareDataTo(AWAITING_APPROVAL)
        val accessionVersionNotInCorrectState = convenienceClient.prepareDataTo(IN_PROCESSING)

        convenienceClient.getSequenceEntry(accessionVersionsInCorrectState.first())
            .assertStatusIs(AWAITING_APPROVAL)
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
                            "[$AWAITING_APPROVAL]: " +
                            "${accessionVersionNotInCorrectState.first().displayAccessionVersion()} - $IN_PROCESSING",
                    ),
                ),
            )

        convenienceClient.getSequenceEntry(accessionVersionsInCorrectState.first())
            .assertStatusIs(AWAITING_APPROVAL)
        convenienceClient.getSequenceEntry(accessionVersionNotInCorrectState.first()).assertStatusIs(
            IN_PROCESSING,
        )
    }

    @Test
    fun `WHEN I approve sequence entries of different organisms THEN request should be rejected`() {
        val defaultOrganismData = convenienceClient.prepareDataTo(AWAITING_APPROVAL, organism = DEFAULT_ORGANISM)
        val otherOrganismData = convenienceClient.prepareDataTo(AWAITING_APPROVAL, organism = OTHER_ORGANISM)

        client.approveProcessedSequenceEntries(
            scope = ALL,
            defaultOrganismData + otherOrganismData,
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
            .assertStatusIs(AWAITING_APPROVAL)
        convenienceClient.getSequenceEntry(
            accession = otherOrganismData.first().accession,
            version = 1,
            organism = OTHER_ORGANISM,
        )
            .assertStatusIs(AWAITING_APPROVAL)
    }

    @Test
    fun `GIVEN multiple organisms WHEN approve all sequences of one org THEN only those of that one are approved`() {
        val defaultOrganismData = convenienceClient.prepareDataTo(AWAITING_APPROVAL, organism = DEFAULT_ORGANISM)
        val otherOrganismData = convenienceClient.prepareDataTo(AWAITING_APPROVAL, organism = OTHER_ORGANISM)

        approveAndVerify(
            scope = ALL,
            accessionVersionsFilter = null,
            accessionVersionsExpectation = defaultOrganismData,
            organism = DEFAULT_ORGANISM,
        )

        // Test one sequence only each to avoid long test duration
        convenienceClient.getSequenceEntry(
            accession = defaultOrganismData.first().accession,
            version = 1,
            organism = DEFAULT_ORGANISM,
        )
            .assertStatusIs(APPROVED_FOR_RELEASE)
        convenienceClient.getSequenceEntry(
            accession = otherOrganismData.first().accession,
            version = 1,
            organism = OTHER_ORGANISM,
        )
            .assertStatusIs(AWAITING_APPROVAL)
    }

    @Test
    fun `GIVEN data with warnings WHEN I approve with different scopes THEN data are approved depending on scope`() {
        val submittedSequences = convenienceClient.prepareDefaultSequenceEntriesToInProcessing()
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
            .assertStatusIs(AWAITING_APPROVAL)
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
        val submittedSequences = convenienceClient.prepareDefaultSequenceEntriesToInProcessing()
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
            .assertStatusIs(AWAITING_APPROVAL)
        convenienceClient.getSequenceEntry(accession = accessionOfSuccessfullyProcessedData, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)
        convenienceClient.getSequenceEntry(accession = accessionOfAnotherSuccessfullyProcessedData, version = 1)
            .assertStatusIs(AWAITING_APPROVAL)
    }

    @Test
    fun `WHEN superuser approves all entries THEN is successfully approved`() {
        val accessionVersions = convenienceClient
            .prepareDataTo(
                AWAITING_APPROVAL,
                username = DEFAULT_USER_NAME,
            ) +
            convenienceClient.prepareDataTo(
                AWAITING_APPROVAL,
                username = DEFAULT_USER_NAME,
            )

        approveAndVerify(
            scope = ALL,
            jwt = jwtForSuperUser,
            accessionVersionsExpectation = accessionVersions
        )

        convenienceClient.getSequenceEntry(accessionVersions.first()).assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    fun `WHEN superuser approves entries of other user THEN is successfully approved`() {
        val accessionVersions = convenienceClient.prepareDataTo(
            AWAITING_APPROVAL,
            username = DEFAULT_USER_NAME,
        )

        approveAndVerify(
            scope = ALL,
            jwt = jwtForSuperUser,
            accessionVersionsFilter = accessionVersions,
        )

        convenienceClient.getSequenceEntry(accessionVersions.first()).assertStatusIs(APPROVED_FOR_RELEASE)
    }
}
