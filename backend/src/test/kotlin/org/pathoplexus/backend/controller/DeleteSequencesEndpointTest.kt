package org.pathoplexus.backend.controller

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.api.SequenceVersion
import org.pathoplexus.backend.api.Status
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class DeleteSequencesEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideValidTestScenarios")
    fun `GIVEN sequences able to delete WHEN tried to delete THEN sequences will be deleted`(
        testScenario: TestScenario,
    ) {
        convenienceClient.prepareDataTo(testScenario.statusAfterPreparation)

        val sequencesToDelete = convenienceClient.getSequencesOfUserInState(
            status = testScenario.statusAfterPreparation,
        )

        val deletionResult = client.deleteSequences(
            sequencesToDelete.map { SequenceVersion(it.sequenceId, it.version) },
        )

        deletionResult.andExpect(status().isNoContent)
        assertThat(
            convenienceClient.getSequencesOfUserInState(
                status = testScenario.statusAfterPreparation,
            ).size,
            `is`(0),
        )
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideInvalidTestScenarios")
    fun `GIVEN sequences unable to delete WHEN tried to delete THEN unprocessable entity error is thrown`(
        testScenario: TestScenario,
    ) {
        convenienceClient.prepareDataTo(testScenario.statusAfterPreparation)

        val sequencesToDelete = convenienceClient.getSequencesOfUserInState(
            status = testScenario.statusAfterPreparation,
        )

        val deletionResult = client.deleteSequences(
            sequencesToDelete.map { SequenceVersion(it.sequenceId, it.version) },
        )

        val listOfAllowedStatuses = "[${Status.RECEIVED}, ${Status.PROCESSED}, " +
            "${Status.NEEDS_REVIEW}, ${Status.REVIEWED}, ${Status.REVOKED_STAGING}]"
        val errorString = "Sequence versions are in not in one of the states $listOfAllowedStatuses: " +
            sequencesToDelete.sortedBy { it.sequenceId }.joinToString(", ") {
                "${it.sequenceId}.${it.version} - ${it.status}"
            }
        deletionResult.andExpect(status().isUnprocessableEntity)
            .andExpect(
                content().contentType(MediaType.APPLICATION_JSON_VALUE),
            )
            .andExpect(
                jsonPath("\$.detail", containsString(errorString)),
            )
        assertThat(
            convenienceClient.getSequencesOfUserInState(
                status = testScenario.statusAfterPreparation,
            ).size,
            `is`(SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `WHEN deleting non-existing sequenceVersions THEN throws an unprocessableEntity error`() {
        convenienceClient.submitDefaultFiles()

        val nonExistingSequenceId = SequenceVersion("123", 1)
        val nonExistingVersion = SequenceVersion("1", 123)

        client.deleteSequences(listOf(nonExistingSequenceId, nonExistingVersion))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("Sequence versions 123.1, 1.123 do not exist")),
            )
    }

    @Test
    fun `WHEN deleting sequence versions not from the submitter THEN throws forbidden error`() {
        convenienceClient.submitDefaultFiles()

        val notSubmitter = "theOneWhoMustNotBeNamed"
        client.deleteSequences(
            listOf(
                SequenceVersion("1", 1),
                SequenceVersion("2", 1),
            ),
            notSubmitter,
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User '$notSubmitter' does not have right to change the sequence versions " +
                        "1.1, 2.1",
                ),
            )
    }

    companion object {
        @JvmStatic
        fun provideValidTestScenarios() = listOf(
            TestScenario(
                Status.RECEIVED,
                true,
            ),
            TestScenario(
                Status.NEEDS_REVIEW,
                true,
            ),
            TestScenario(
                Status.REVIEWED,
                true,
            ),
            TestScenario(
                Status.PROCESSED,
                true,
            ),
            TestScenario(
                Status.REVOKED_STAGING,
                true,
            ),
        )

        @JvmStatic
        fun provideInvalidTestScenarios() = listOf(
            TestScenario(
                Status.PROCESSING,
                false,
            ),
            TestScenario(
                Status.SILO_READY,
                false,
            ),
        )
    }
}

data class TestScenario(
    val statusAfterPreparation: Status,
    val expectedToSucceed: Boolean,
) {
    override fun toString(): String {
        val resultString = if (expectedToSucceed) {
            "sequences are deleted"
        } else {
            "the deletion operation fails"
        }
        return "GIVEN own sequences in $statusAfterPreparation status THEN $resultString"
    }
}
