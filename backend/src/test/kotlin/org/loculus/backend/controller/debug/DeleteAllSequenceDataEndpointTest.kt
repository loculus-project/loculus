package org.loculus.backend.controller.debug

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit.Companion.MONTH
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsChangeRequest
import org.loculus.backend.api.Status
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.datauseterms.DataUseTermsControllerClient
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.controller.withAuth
import org.loculus.backend.service.submission.UseNewerProcessingPipelineVersionTask
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(properties = ["${BackendSpringProperty.DEBUG_MODE}=true"])
class DeleteAllSequenceDataEndpointTest(
    @Autowired private val submissionConvenienceClient: SubmissionConvenienceClient,
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
    @Autowired private val dataUseTermsClient: DataUseTermsControllerClient,
    @Autowired private val useNewerProcessingPipelineVersionTask: UseNewerProcessingPipelineVersionTask,
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            deleteAllSequences(jwt = it)
        }
    }

    @Test
    fun `WHEN non-superuser calls endpoint THEN is forbidden`() {
        deleteAllSequences(jwtForDefaultUser)
            .andExpect(status().isForbidden)
    }

    @Test
    fun `WHEN superuser calls endpoint THEN is allowed`() {
        deleteAllSequences(jwtForSuperUser)
            .andExpect(status().isNoContent)
    }

    @Test
    fun `GIVEN released sequences WHEN deleting all sequences THEN has no released sequences`() {
        submissionConvenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)

        val releasedData = submissionConvenienceClient.getReleasedData()
        assertThat(releasedData, hasSize(NUMBER_OF_SEQUENCES))

        deleteAllSequences(jwtForSuperUser)
            .andExpect(status().isNoContent)

        val releasedDataAfterDeletion = submissionConvenienceClient.getReleasedData()
        assertThat(releasedDataAfterDeletion, `is`(empty()))
    }

    @Test
    fun `GIVEN user submitted sequences WHEN deleting all sequences THEN shows no sequences for user`() {
        val statuses = listOf(Status.RECEIVED, Status.IN_PROCESSING, Status.PROCESSED, Status.APPROVED_FOR_RELEASE)
        statuses.forEach { status ->
            submissionConvenienceClient.prepareDataTo(status = status, username = DEFAULT_USER_NAME)
        }

        val sequenceEntriesResponse = submissionConvenienceClient.getSequenceEntries()
        val sequenceEntries = sequenceEntriesResponse.sequenceEntries
        assertThat(sequenceEntries, hasSize(statuses.size * NUMBER_OF_SEQUENCES))

        deleteAllSequences(jwtForSuperUser)
            .andExpect(status().isNoContent)

        val sequenceEntriesAfterDeletion = submissionConvenienceClient.getSequenceEntries().sequenceEntries
        assertThat(sequenceEntriesAfterDeletion, `is`(empty()))
    }

    @Test
    fun `GIVEN accession with data user terms history WHEN deleting all sequences THEN history is deleted`() {
        val restrictedDataUseTerms = DataUseTerms.Restricted(
            Clock.System.now().toLocalDateTime(DateProvider.timeZone).date.plus(1, MONTH),
        )
        val accession = submissionConvenienceClient.submitDefaultFiles(dataUseTerms = restrictedDataUseTerms)
            .submissionIdMappings
            .first()
            .accession

        dataUseTermsClient.changeDataUseTerms(
            DataUseTermsChangeRequest(
                accessions = listOf(accession),
                newDataUseTerms = DataUseTerms.Open,
            ),
        )

        dataUseTermsClient.getDataUseTerms(accession)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*]", hasSize<List<*>>(2)))

        deleteAllSequences(jwtForSuperUser)
            .andExpect(status().isNoContent)

        dataUseTermsClient.getDataUseTerms(accession)
            .andExpect(status().isNotFound)
    }

    @Test
    fun `GIVEN preprocessing pipeline version 2 WHEN deleting all sequences THEN can start with version 1 again`() {
        submissionConvenienceClient.prepareDataTo(Status.PROCESSED)

        val extractedData = submissionConvenienceClient.extractUnprocessedData(pipelineVersion = 2)
        val processedData = extractedData
            .map { PreparedProcessedData.successfullyProcessed(accession = it.accession, version = it.version) }
        submissionConvenienceClient.submitProcessedData(processedData, pipelineVersion = 2)

        useNewerProcessingPipelineVersionTask.task()
        submissionControllerClient.extractUnprocessedData(numberOfSequenceEntries = 1, pipelineVersion = 1)
            .andExpect(status().isUnprocessableEntity)

        deleteAllSequences(jwtForSuperUser)
            .andExpect(status().isNoContent)

        submissionConvenienceClient.prepareDataTo(Status.RECEIVED)
        val extractedDataAfterDeletion = submissionConvenienceClient.extractUnprocessedData(pipelineVersion = 1)
        assertThat(extractedDataAfterDeletion, hasSize(NUMBER_OF_SEQUENCES))
    }

    @Test
    fun `GIVEN I deleted all sequences WHEN submitting again THEN new sequences are present`() {
        submissionConvenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)
        val accessionsBeforeDeletion = submissionConvenienceClient.getReleasedData()
            .map { it.metadata["accession"]?.textValue() }

        deleteAllSequences(jwtForSuperUser)
            .andExpect(status().isNoContent)

        val firstNewAccession = submissionConvenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE).first().accession
        val accessionsAfterDeletion = submissionConvenienceClient.getReleasedData()
            .map { it.metadata["accession"]?.textValue() }
        assertThat(accessionsAfterDeletion, hasSize(NUMBER_OF_SEQUENCES))
        assertThat(accessionsAfterDeletion, hasItem(firstNewAccession))
        assertThat(accessionsAfterDeletion, not(hasItem(accessionsBeforeDeletion.first())))
    }

    private fun deleteAllSequences(jwt: String?) = deleteAllSequences(mockMvc, jwt)
}

@EndpointTest
class DeleteAllSequenceDataEndpointWithDebugModeOffTest(@Autowired private val mockMvc: MockMvc) {
    @Test
    fun `GIVEN debug mode is off THEN delete all sequence data endpoint is not present`() {
        deleteAllSequences(mockMvc, jwtForSuperUser)
            .andExpect(status().isNotFound)
    }
}

private fun deleteAllSequences(mockMvc: MockMvc, jwt: String?) = mockMvc.perform(
    post("/debug/delete-all-sequence-data")
        .withAuth(jwt),
)
