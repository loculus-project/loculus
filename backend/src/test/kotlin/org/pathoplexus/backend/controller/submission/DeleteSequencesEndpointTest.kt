package org.pathoplexus.backend.controller.submission

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.controller.DEFAULT_ORGANISM
import org.pathoplexus.backend.controller.OTHER_ORGANISM
import org.pathoplexus.backend.controller.expectUnauthorizedResponse
import org.pathoplexus.backend.controller.generateJwtFor
import org.pathoplexus.backend.controller.toAccessionVersion
import org.pathoplexus.backend.utils.AccessionVersionComparator
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

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.deleteSequenceEntries(
                emptyList(),
                jwt = it,
            )
        }
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideValidTestScenarios")
    fun `GIVEN accession versions able to delete WHEN tried to delete THEN sequences will be deleted`(
        testScenario: TestScenario,
    ) {
        convenienceClient.prepareDataTo(testScenario.statusAfterPreparation)

        val accessionVersionsToDelete = convenienceClient.getSequenceEntriesOfUserInState(
            status = testScenario.statusAfterPreparation,
        )

        val deletionResult = client.deleteSequenceEntries(
            accessionVersionsToDelete.map { AccessionVersion(it.accession, it.version) },
        )

        deletionResult.andExpect(status().isNoContent)
        assertThat(
            convenienceClient.getSequenceEntriesOfUserInState(
                status = testScenario.statusAfterPreparation,
            ).size,
            `is`(0),
        )
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideInvalidTestScenarios")
    fun `GIVEN accession versions unable to delete WHEN tried to delete THEN unprocessable entity error is thrown`(
        testScenario: TestScenario,
    ) {
        convenienceClient.prepareDataTo(testScenario.statusAfterPreparation)

        val accessionVersionsToDelete = convenienceClient.getSequenceEntriesOfUserInState(
            status = testScenario.statusAfterPreparation,
        )

        val deletionResult = client.deleteSequenceEntries(
            accessionVersionsToDelete.map { AccessionVersion(it.accession, it.version) },
        )

        val listOfAllowedStatuses = "[${Status.RECEIVED}, ${Status.AWAITING_APPROVAL}, " +
            "${Status.HAS_ERRORS}, ${Status.AWAITING_APPROVAL_FOR_REVOCATION}]"
        val errorString = "Accession versions are in not in one of the states $listOfAllowedStatuses: " +
            accessionVersionsToDelete.sortedWith(AccessionVersionComparator).joinToString(", ") {
                "${it.accession}.${it.version} - ${it.status}"
            }
        deletionResult.andExpect(status().isUnprocessableEntity)
            .andExpect(
                content().contentType(MediaType.APPLICATION_JSON_VALUE),
            )
            .andExpect(
                jsonPath("\$.detail", containsString(errorString)),
            )
        assertThat(
            convenienceClient.getSequenceEntriesOfUserInState(
                status = testScenario.statusAfterPreparation,
            ).size,
            `is`(SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `WHEN deleting non-existing accessionVersions THEN throws an unprocessableEntity error`() {
        convenienceClient.submitDefaultFiles()

        val nonExistingAccession = AccessionVersion("123", 1)
        val nonExistingVersion = AccessionVersion("1", 123)

        client.deleteSequenceEntries(listOf(nonExistingAccession, nonExistingVersion))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("Accession versions 1.123, 123.1 do not exist")),
            )
    }

    @Test
    fun `WHEN deleting sequence entry of wrong organism THEN throws an unprocessableEntity error`() {
        val accessionVersion = convenienceClient.submitDefaultFiles(organism = DEFAULT_ORGANISM)[0]

        client.deleteSequenceEntries(listOf(accessionVersion.toAccessionVersion()), organism = OTHER_ORGANISM)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("accession versions are not of organism $OTHER_ORGANISM:")),
            )
    }

    @Test
    fun `WHEN deleting accession versions not from the submitter THEN throws forbidden error`() {
        convenienceClient.submitDefaultFiles()

        val notSubmitter = "theOneWhoMustNotBeNamed"
        client.deleteSequenceEntries(
            listOf(
                AccessionVersion("1", 1),
                AccessionVersion("2", 1),
            ),
            jwt = generateJwtFor(notSubmitter),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User '$notSubmitter' does not have right to change the accession versions " +
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
                Status.HAS_ERRORS,
                true,
            ),
            TestScenario(
                Status.RECEIVED,
                true,
            ),
            TestScenario(
                Status.AWAITING_APPROVAL,
                true,
            ),
            TestScenario(
                Status.AWAITING_APPROVAL_FOR_REVOCATION,
                true,
            ),
        )

        @JvmStatic
        fun provideInvalidTestScenarios() = listOf(
            TestScenario(
                Status.IN_PROCESSING,
                false,
            ),
            TestScenario(
                Status.APPROVED_FOR_RELEASE,
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
