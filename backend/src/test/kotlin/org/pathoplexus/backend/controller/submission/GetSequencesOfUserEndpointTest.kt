package org.pathoplexus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.controller.DEFAULT_ORGANISM
import org.pathoplexus.backend.controller.EndpointTest
import org.pathoplexus.backend.controller.OTHER_ORGANISM
import org.pathoplexus.backend.controller.expectUnauthorizedResponse
import org.pathoplexus.backend.controller.getAccessionVersions
import org.pathoplexus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.controller.submission.SubmitFiles.DefaultFiles.firstAccession
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class GetSequencesOfUserEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse { client.getSequenceEntriesOfUser(jwt = it) }
    }

    @Test
    fun `GIVEN some sequence entries in the database THEN only shows entries of the given user`() {
        convenienceClient.submitDefaultFiles(DEFAULT_USER_NAME)

        val sequencesOfUser = convenienceClient.getSequenceEntriesOfUser(DEFAULT_USER_NAME)
        assertThat(sequencesOfUser, hasSize(DefaultFiles.NUMBER_OF_SEQUENCES))

        val sequencesOfOtherUser = convenienceClient.getSequenceEntriesOfUser("otherUser")
        assertThat(sequencesOfOtherUser, `is`(emptyList()))
    }

    @Test
    fun `GIVEN some sequence entries in the database THEN only shows entries of the requested organism`() {
        val defaultOrganismData = convenienceClient.submitDefaultFiles(organism = DEFAULT_ORGANISM)
        val otherOrganismData = convenienceClient.submitDefaultFiles(organism = OTHER_ORGANISM)

        val sequencesOfUser = convenienceClient.getSequenceEntriesOfUser(DEFAULT_USER_NAME, organism = OTHER_ORGANISM)
        assertThat(
            sequencesOfUser.getAccessionVersions(),
            containsInAnyOrder(*otherOrganismData.getAccessionVersions().toTypedArray()),
        )
        assertThat(
            sequencesOfUser.getAccessionVersions().intersect(defaultOrganismData.getAccessionVersions().toSet()),
            `is`(empty()),
        )
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideStatusScenarios")
    fun `GIVEN database in prepared state THEN returns sequence entries in expected status`(scenario: Scenario) {
        scenario.prepareDatabase(convenienceClient)

        val sequencesOfUser = convenienceClient.getSequenceEntriesOfUser()

        val accessionVersionStatus =
            sequencesOfUser.find { it.accession == firstAccession && it.version == scenario.expectedVersion }
        assertThat(accessionVersionStatus?.status, `is`(scenario.expectedStatus))
        assertThat(accessionVersionStatus?.isRevocation, `is`(scenario.expectedIsRevocation))
    }

    companion object {
        @JvmStatic
        fun provideStatusScenarios() = listOf(
            Scenario(
                setupDescription = "I submitted sequence entries",
                prepareDatabase = { it.submitDefaultFiles() },
                expectedStatus = Status.RECEIVED,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I started processing sequence entries",
                prepareDatabase = { it.prepareDefaultSequenceEntriesToInProcessing() },
                expectedStatus = Status.IN_PROCESSING,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted sequence entries that have errors",
                prepareDatabase = { it.prepareDefaultSequenceEntriesToHasErrors() },
                expectedStatus = Status.HAS_ERRORS,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted sequence entries that have been successfully processed",
                prepareDatabase = { it.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed()) },
                expectedStatus = Status.AWAITING_APPROVAL,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted, processed and approved sequence entries",
                prepareDatabase = {
                    it.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())
                    it.approveProcessedSequenceEntries(listOf(AccessionVersion(firstAccession, 1)))
                },
                expectedStatus = Status.APPROVED_FOR_RELEASE,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted a revocation",
                prepareDatabase = {
                    it.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())
                    it.approveProcessedSequenceEntries(listOf(AccessionVersion(firstAccession, 1)))
                    it.revokeSequenceEntries(listOf(firstAccession))
                },
                expectedStatus = Status.AWAITING_APPROVAL_FOR_REVOCATION,
                expectedIsRevocation = true,
                expectedVersion = 2,
            ),
            Scenario(
                setupDescription = "I approved a revocation",
                prepareDatabase = {
                    it.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())
                    it.approveProcessedSequenceEntries(listOf(AccessionVersion(firstAccession, 1)))
                    it.revokeSequenceEntries(listOf(firstAccession))
                    it.confirmRevocation(listOf(AccessionVersion(firstAccession, 2)))
                },
                expectedStatus = Status.APPROVED_FOR_RELEASE,
                expectedIsRevocation = true,
                expectedVersion = 2,
            ),
        )
    }

    data class Scenario(
        val setupDescription: String,
        val expectedVersion: Long = 1,
        val prepareDatabase: (SubmissionConvenienceClient) -> Unit,
        val expectedStatus: Status,
        val expectedIsRevocation: Boolean,
    ) {
        override fun toString(): String {
            val maybeRevocationSequence = when {
                expectedIsRevocation -> "revocation sequence"
                else -> "sequence"
            }

            return "GIVEN $setupDescription THEN shows $maybeRevocationSequence in status ${expectedStatus.name}"
        }
    }
}
