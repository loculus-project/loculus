package org.loculus.backend.controller.submission

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.CoreMatchers.not
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasProperty
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.DeleteSequenceScope
import org.loculus.backend.api.DeleteSequenceScope.ALL
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.Status
import org.loculus.backend.api.Status.PROCESSED
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.controller.toAccessionVersion
import org.loculus.backend.utils.AccessionVersionComparator
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
                scope = ALL,
                accessionVersionsFilter = emptyList(),
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
        if (testScenario.statusAfterPreparation == Status.PROCESSED) {
            convenienceClient.prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation()
        }

        val accessionVersionsToDelete = convenienceClient.getSequenceEntriesOfUserInState(
            status = testScenario.statusAfterPreparation,
        )

        val deletionResult = client.deleteSequenceEntries(
            scope = ALL,
            accessionVersionsFilter = accessionVersionsToDelete.map {
                AccessionVersion(it.accession, it.version)
            },
        )

        deletionResult
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(accessionVersionsToDelete.size))

        accessionVersionsToDelete.forEach {
            deletionResult.andExpect(jsonPath("\$[*].accession", hasItem(it.accession)))
        }

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
            scope = ALL,
            accessionVersionsFilter = accessionVersionsToDelete.map {
                AccessionVersion(it.accession, it.version)
            },
        )

        val listOfAllowedStatuses = "[${Status.RECEIVED}, ${Status.PROCESSED}]"
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
            `is`(NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `WHEN deleting non-existing accessionVersions THEN throws an unprocessableEntity error`() {
        convenienceClient.submitDefaultFiles()

        val nonExistingAccession = AccessionVersion("123", 1)
        val nonExistingVersion = AccessionVersion("1", 123)

        client.deleteSequenceEntries(
            scope = ALL,
            accessionVersionsFilter = listOf(nonExistingAccession, nonExistingVersion),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Accession versions 1.123, 123.1 do not exist"),
                ),
            )
    }

    @Test
    fun `WHEN deleting via scope = ALL THEN expect all accessions to be deleted `() {
        val erroneousSequences = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true)
        val approvableSequences = convenienceClient.prepareDataTo(Status.PROCESSED)

        assertThat(
            convenienceClient.getSequenceEntries().sequenceEntries,
            hasSize(erroneousSequences.size + approvableSequences.size),
        )

        client.deleteSequenceEntries(scope = ALL)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(2 * NUMBER_OF_SEQUENCES))

        assertThat(
            convenienceClient.getSequenceEntries().sequenceEntries,
            hasSize(0),
        )
    }

    @Test
    fun `WHEN deleting via scope = PROCESSED_WITH_ERRORS THEN expect all accessions with errors to be deleted `() {
        val erroneousSequences = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true)
        val approvableSequences = convenienceClient.prepareDataTo(Status.PROCESSED)

        assertThat(
            convenienceClient.getStatusCount(Status.PROCESSED),
            equalTo(erroneousSequences.size + approvableSequences.size),
        )
        assertThat(
            convenienceClient.getProcessingResultCount(ProcessingResult.ERRORS),
            equalTo(erroneousSequences.size),
        )
        assertThat(
            convenienceClient.getProcessingResultCount(ProcessingResult.PERFECT) +
                convenienceClient.getProcessingResultCount(ProcessingResult.WARNINGS),
            equalTo(approvableSequences.size),
        )

        client.deleteSequenceEntries(scope = DeleteSequenceScope.PROCESSED_WITH_ERRORS)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))

        assertThat(
            convenienceClient.getProcessingResultCount(ProcessingResult.ERRORS),
            equalTo(0),
        )
        assertThat(
            convenienceClient.getProcessingResultCount(ProcessingResult.PERFECT) +
                convenienceClient.getProcessingResultCount(ProcessingResult.WARNINGS),
            equalTo(approvableSequences.size),
        )
    }

    @Test
    fun `WHEN deleting via scope = PROCESSED_WITH_WARNINGS THEN expect all accessions with warnings to be deleted `() {
        val originalSubmission = convenienceClient.prepareDefaultSequenceEntriesToInProcessing()
        val sequenceWithWarning = PreparedProcessedData.withWarnings(originalSubmission.first().accession)
        convenienceClient.submitProcessedData(sequenceWithWarning)

        val countOfSequenceEntriesWithWarnings = 1

        assertThat(
            convenienceClient.getSequenceEntries().sequenceEntries,
            hasSize(originalSubmission.size),
        )

        val containsSequenceWithWarning =
            hasItem<SequenceEntryStatus>(hasProperty("accession", `is`(sequenceWithWarning.accession)))

        assertThat(convenienceClient.getSequenceEntries().sequenceEntries, containsSequenceWithWarning)

        client.deleteSequenceEntries(scope = DeleteSequenceScope.PROCESSED_WITH_WARNINGS)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(countOfSequenceEntriesWithWarnings))

        assertThat(convenienceClient.getSequenceEntries().sequenceEntries, not(containsSequenceWithWarning))
    }

    @Test
    fun `WHEN deleting sequence entry of wrong organism THEN throws an unprocessableEntity error`() {
        val defaultOrganismData = convenienceClient.prepareDataTo(PROCESSED, organism = DEFAULT_ORGANISM)
        val otherOrganismData = convenienceClient.prepareDataTo(PROCESSED, organism = OTHER_ORGANISM)

        client.deleteSequenceEntries(
            scope = ALL,
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*]", hasSize<List<*>>(otherOrganismData.size)))
            .andExpect(jsonPath("$.[*].accession", hasItem(otherOrganismData.first().accession)))

        convenienceClient.getSequenceEntry(
            accession = defaultOrganismData.first().accession,
            version = 1,
            organism = DEFAULT_ORGANISM,
        )
            .assertStatusIs(PROCESSED)
    }

    @Test
    fun `GIVEN multiple organisms WHEN I delete all sequences THEN deletes only sequences of that organism`() {
        val accessionVersion = convenienceClient.submitDefaultFiles(organism = DEFAULT_ORGANISM).submissionIdMappings[0]

        client.deleteSequenceEntries(
            scope = ALL,
            accessionVersionsFilter = listOf(accessionVersion.toAccessionVersion()),
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("accession versions are not of organism $OTHER_ORGANISM:")),
            )
    }

    @Test
    fun `WHEN deleting accession versions not from the submitter THEN throws forbidden error`() {
        val accessionVersions = convenienceClient.submitDefaultFiles().submissionIdMappings

        val notSubmitter = "theOneWhoMustNotBeNamed"
        client.deleteSequenceEntries(
            scope = ALL,
            accessionVersionsFilter = accessionVersions,
            jwt = generateJwtFor(notSubmitter),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("is not a member of group")),
            )
    }

    @Test
    fun `WHEN superuser deletes all entries THEN is successfully deleted`() {
        val accessionVersions = convenienceClient
            .submitDefaultFiles(
                username = DEFAULT_USER_NAME,
            ).submissionIdMappings +
            convenienceClient.submitDefaultFiles(
                username = DEFAULT_USER_NAME,
            ).submissionIdMappings

        client.deleteSequenceEntries(scope = ALL, jwt = jwtForSuperUser)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(accessionVersions.size))
            .andExpect(jsonPath("\$[0].accession").value(accessionVersions.first().accession))
            .andExpect(jsonPath("\$[0].version").value(accessionVersions.first().version))
    }

    @Test
    fun `WHEN superuser deletes entries of other user THEN is successfully deleted`() {
        val accessionVersions = convenienceClient
            .submitDefaultFiles(
                username = DEFAULT_USER_NAME,
            )
            .submissionIdMappings

        client.deleteSequenceEntries(
            scope = ALL,
            accessionVersionsFilter = accessionVersions,
            jwt = jwtForSuperUser,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(accessionVersions.size))
            .andExpect(jsonPath("\$[0].accession").value(accessionVersions.first().accession))
            .andExpect(jsonPath("\$[0].version").value(accessionVersions.first().version))
    }

    @Test
    @Suppress("ktlint:standard:max-line-length")
    fun `GIVEN data with and without warnings WHEN I delete only warnings THEN only sequence with warning is deleted`() {
        val submittedSequences =
            convenienceClient.prepareDefaultSequenceEntriesToInProcessing()
        val accessionOfSuccessfullyProcessedData = submittedSequences[0].accession
        val accessionWithWarnings = submittedSequences[1].accession

        convenienceClient.submitProcessedData(
            PreparedProcessedData.withWarnings(accession = accessionWithWarnings),
        )
        convenienceClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessionOfSuccessfullyProcessedData),
        )

        client.deleteSequenceEntries(
            scope = DeleteSequenceScope.PROCESSED_WITH_WARNINGS,
            accessionVersionsFilter = listOf(
                AccessionVersion(accessionWithWarnings, 1),
                AccessionVersion(accessionOfSuccessfullyProcessedData, 1),
            ),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(1))

        assertThat(
            convenienceClient.getSequenceEntries().sequenceEntries,
            not(hasItem<SequenceEntryStatus>(hasProperty("accession", `is`(accessionWithWarnings)))),
        )

        convenienceClient.getSequenceEntry(accession = accessionOfSuccessfullyProcessedData, version = 1)
            .assertStatusIs(Status.PROCESSED)
    }

    companion object {
        @JvmStatic
        fun provideValidTestScenarios() = listOf(
            TestScenario(
                Status.RECEIVED,
                true,
            ),
            TestScenario(
                Status.RECEIVED,
                true,
            ),
            TestScenario(
                Status.PROCESSED,
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

data class TestScenario(val statusAfterPreparation: Status, val expectedToSucceed: Boolean) {
    override fun toString(): String {
        val resultString = if (expectedToSucceed) {
            "sequences are deleted"
        } else {
            "the deletion operation fails"
        }
        return "GIVEN own sequences in $statusAfterPreparation status THEN $resultString"
    }
}
