package org.pathoplexus.backend.controller

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.api.SequenceVersion
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.firstSequence
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class GetSequencesOfUserEndpointTest(@Autowired val convenienceClient: SubmissionConvenienceClient) {

    @Test
    fun `GIVEN some sequences in the database THEN only shows sequences of the given user`() {
        convenienceClient.submitDefaultFiles(USER_NAME)

        val sequencesOfUser = convenienceClient.getSequencesOfUser(USER_NAME)
        assertThat(sequencesOfUser, hasSize(DefaultFiles.NUMBER_OF_SEQUENCES))

        val sequencesOfOtherUser = convenienceClient.getSequencesOfUser("otherUser")
        assertThat(sequencesOfOtherUser, `is`(emptyList()))
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideStatusScenarios")
    fun `GIVEN database in prepared state THEN returns sequence in expected status`(scenario: Scenario) {
        scenario.prepareDatabase(convenienceClient)

        val sequencesOfUser = convenienceClient.getSequencesOfUser()

        val sequenceVersionStatus =
            sequencesOfUser.find { it.sequenceId == firstSequence && it.version == scenario.expectedVersion }
        assertThat(sequenceVersionStatus?.status, `is`(scenario.expectedStatus))
        assertThat(sequenceVersionStatus?.isRevocation, `is`(scenario.expectedIsRevocation))
    }

    companion object {
        @JvmStatic
        fun provideStatusScenarios() = listOf(
            Scenario(
                setupDescription = "I submitted sequences",
                prepareDatabase = { it.submitDefaultFiles() },
                expectedStatus = Status.RECEIVED,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I started processing sequences",
                prepareDatabase = { it.prepareDefaultSequencesToProcessing() },
                expectedStatus = Status.PROCESSING,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted sequences that need review",
                prepareDatabase = { it.prepareDefaultSequencesToNeedReview() },
                expectedStatus = Status.NEEDS_REVIEW,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted sequences that have been successfully processed",
                prepareDatabase = { it.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed()) },
                expectedStatus = Status.PROCESSED,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted, processed and approved sequences",
                prepareDatabase = {
                    it.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())
                    it.approveProcessedSequences(listOf(SequenceVersion(firstSequence, 1)))
                },
                expectedStatus = Status.SILO_READY,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted a revocation",
                prepareDatabase = {
                    it.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())
                    it.approveProcessedSequences(listOf(SequenceVersion(firstSequence, 1)))
                    it.revokeSequences(listOf(firstSequence))
                },
                expectedStatus = Status.REVOKED_STAGING,
                expectedIsRevocation = true,
                expectedVersion = 2,
            ),
            Scenario(
                setupDescription = "I approved a revocation",
                prepareDatabase = {
                    it.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())
                    it.approveProcessedSequences(listOf(SequenceVersion(firstSequence, 1)))
                    it.revokeSequences(listOf(firstSequence))
                    it.confirmRevocation(listOf(SequenceVersion(firstSequence, 2)))
                },
                expectedStatus = Status.SILO_READY,
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
