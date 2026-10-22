package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import com.ninjasquad.springmockk.MockkSpyBean
import io.mockk.every
import io.mockk.verify
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.lessThanOrEqualTo
import org.junit.jupiter.api.Test
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsChangeRequest
import org.loculus.backend.api.DeleteSequenceScope
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.SubmissionLimits
import org.loculus.backend.config.readBackendConfig
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.datauseterms.DataUseTermsControllerClient
import org.loculus.backend.controller.dateMonthsFromNow
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.service.submission.RateLimitAlertNotifier
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours

// The default submission contains 10 sequence entries.
private const val MAX_OPERATIONS = 15L

// Group IDs restart at 1 for every test, so the third, fourth and fifth group created in a test get these IDs.
private const val EXEMPT_GROUP_ID = 3
private const val OWN_QUOTA_GROUP_ID = 4
private const val PAUSED_GROUP_ID = 5

private const val SECONDS_PER_DAY = 24 * 60 * 60

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
@Import(BackendConfigWithSubmissionLimitsTestConfig::class)
@TestPropertySource(properties = ["spring.main.allow-bean-definition-overriding=true"])
class SubmissionLimitsEndpointTest(
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val filesClient: FilesClient,
    @Autowired private val dataUseTermsClient: DataUseTermsControllerClient,
) {
    @MockkBean(relaxed = true)
    lateinit var alertNotifier: RateLimitAlertNotifier

    @MockkSpyBean
    lateinit var dateProvider: DateProvider

    private fun newGroup() = groupManagementClient.createNewGroup(group = DEFAULT_GROUP).andGetGroupId()

    private fun submitDefaultFilesExpectingTooManyRequests(groupId: Int) =
        submissionControllerClient.submit(DefaultFiles.metadataFile, DefaultFiles.sequencesFile, groupId = groupId)
            .andExpect(status().isTooManyRequests)

    @Test
    fun `GIVEN an upload that would exceed the quota THEN it is rejected as a whole with a retry time`() {
        val groupId = newGroup()
        convenienceClient.submitDefaultFiles(groupId = groupId)

        val response = submitDefaultFilesExpectingTooManyRequests(groupId)
            .andExpect(content().string(containsString("quota shared by all groups without their own quota")))
            .andExpect(content().string(containsString("10 of $MAX_OPERATIONS")))
            .andExpect(content().string(containsString("at least 20% of the quota is free")))
            .andExpect(content().string(containsString("contact the instance administrators")))
            .andReturn().response

        assertThat(
            response.getHeader("Retry-After")!!.toInt(),
            allOf(greaterThan(SECONDS_PER_DAY - 600), lessThanOrEqualTo(SECONDS_PER_DAY + 1)),
        )
        assertThat(convenienceClient.getSequenceEntries().sequenceEntries, hasSize(10))
    }

    @Test
    fun `GIVEN usage passes 80 percent and then the quota THEN alerts are sent`() {
        val groupId = newGroup()
        filesClient.requestUploads(groupId, numberFiles = 12, jwt = jwtForDefaultUser).andExpect(status().isOk)
        verify { alertNotifier.notify("shared", any(), 80, 12, MAX_OPERATIONS) }

        filesClient.requestUploads(groupId, numberFiles = 5, jwt = jwtForDefaultUser)
            .andExpect(status().isTooManyRequests)
        verify { alertNotifier.notify("shared", any(), 100, 12, MAX_OPERATIONS) }
    }

    @Test
    fun `GIVEN a rejected request THEN the retry time leaves at least 20 percent of the quota free`() {
        val groupId = newGroup()
        val start = Clock.System.now()
        every { dateProvider.getCurrentInstant() } returns start
        filesClient.requestUploads(groupId, numberFiles = 2, jwt = jwtForDefaultUser).andExpect(status().isOk)
        every { dateProvider.getCurrentInstant() } returns start + 1.hours
        filesClient.requestUploads(groupId, numberFiles = 13, jwt = jwtForDefaultUser).andExpect(status().isOk)
        every { dateProvider.getCurrentInstant() } returns start + 2.hours

        // The 2 files from the start leaving the window would make room for 1 file, but 20% of 15 is 3,
        // so the retry time is when the 13 files from start + 1h leave it: 23h from now.
        val retryAfter = filesClient.requestUploads(groupId, numberFiles = 1, jwt = jwtForDefaultUser)
            .andExpect(status().isTooManyRequests)
            .andReturn().response.getHeader("Retry-After")!!.toLong()
        assertThat(retryAfter, allOf(greaterThan(23 * 3600L - 5), lessThanOrEqualTo(23 * 3600L + 1)))
    }

    @Test
    fun `GIVEN deleted entries THEN they still count against the quota`() {
        val groupId = newGroup()
        convenienceClient.submitDefaultFiles(groupId = groupId)
        submissionControllerClient.deleteSequenceEntries(DeleteSequenceScope.ALL).andExpect(status().isOk)
        assertThat(convenienceClient.getSequenceEntries().sequenceEntries, hasSize(0))

        submitDefaultFilesExpectingTooManyRequests(groupId)
    }

    @Test
    fun `GIVEN revisions and revocations THEN they count against the quota`() {
        val accessions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map { it.accession }

        submissionControllerClient.reviseSequenceEntries(
            DefaultFiles.getRevisedMetadataFile(accessions),
            DefaultFiles.sequencesFile,
        ).andExpect(status().isTooManyRequests)
        submissionControllerClient.revokeSequenceEntries(accessions).andExpect(status().isTooManyRequests)
    }

    @Test
    fun `GIVEN a data use terms change exceeding the quota THEN it is rejected and not applied`() {
        val accessions = convenienceClient
            .submitDefaultFiles(dataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(6)))
            .submissionIdMappings.map { it.accession }

        dataUseTermsClient.changeDataUseTerms(DataUseTermsChangeRequest(accessions, DataUseTerms.Open))
            .andExpect(status().isTooManyRequests)
        dataUseTermsClient.changeDataUseTerms(DataUseTermsChangeRequest(accessions.take(5), DataUseTerms.Open))
            .andExpect(status().isNoContent)
    }

    @Test
    fun `GIVEN file upload requests exceeding the quota THEN they are rejected`() {
        val groupId = newGroup()

        filesClient.requestUploads(groupId, numberFiles = 10, jwt = jwtForDefaultUser).andExpect(status().isOk)
        filesClient.requestUploads(groupId, numberFiles = 10, jwt = jwtForDefaultUser)
            .andExpect(status().isTooManyRequests)
        filesClient.requestMultipartUploads(groupId, numberFiles = 10).andExpect(status().isTooManyRequests)
        filesClient.requestUploads(groupId, numberFiles = 5, jwt = jwtForDefaultUser).andExpect(status().isOk)
    }

    @Test
    fun `GIVEN a superuser THEN no quota applies, but the writes still count for others`() {
        val groupId = newGroup()
        repeat(2) {
            submissionControllerClient.submit(
                DefaultFiles.metadataFile,
                DefaultFiles.sequencesFile,
                groupId = groupId,
                jwt = jwtForSuperUser,
            ).andExpect(status().isOk)
        }

        submitDefaultFilesExpectingTooManyRequests(groupId)
            .andExpect(content().string(containsString("20 of $MAX_OPERATIONS")))
    }

    @Test
    fun `GIVEN many groups without their own quota THEN they share one quota`() {
        convenienceClient.submitDefaultFiles(groupId = newGroup())

        submitDefaultFilesExpectingTooManyRequests(newGroup())
    }

    @Test
    fun `GIVEN a group with its own quota THEN it is limited separately, and exempt groups are not limited`() {
        val sharedGroup = newGroup()
        newGroup()
        val exemptGroup = newGroup()
        val ownQuotaGroup = newGroup()
        assertThat(listOf(exemptGroup, ownQuotaGroup), equalTo(listOf(EXEMPT_GROUP_ID, OWN_QUOTA_GROUP_ID)))

        convenienceClient.submitDefaultFiles(groupId = sharedGroup)
        repeat(3) { convenienceClient.submitDefaultFiles(groupId = exemptGroup) }
        convenienceClient.submitDefaultFiles(groupId = ownQuotaGroup)

        submitDefaultFilesExpectingTooManyRequests(ownQuotaGroup)
            .andExpect(content().string(containsString("quota of group $OWN_QUOTA_GROUP_ID")))
    }

    @Test
    fun `GIVEN one revision spanning several groups THEN each group's quota is charged for its own entries`() {
        val sharedGroup = newGroup()
        newGroup()
        val exemptGroup = newGroup()
        val ownQuotaGroup = newGroup()
        val exemptAccessions = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease(groupId = exemptGroup).map { it.accession }
        val ownQuotaAccessions = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease(groupId = ownQuotaGroup).map { it.accession }

        submissionControllerClient.reviseSequenceEntries(
            DefaultFiles.getRevisedMetadataFile(exemptAccessions.take(5) + ownQuotaAccessions.take(5)),
            DefaultFiles.sequencesFile,
        ).andExpect(status().isOk)

        // The own-quota group has used 10 submissions + 5 revisions = its whole quota; the shared quota is untouched.
        filesClient.requestUploads(ownQuotaGroup, numberFiles = 1, jwt = jwtForDefaultUser)
            .andExpect(status().isTooManyRequests)
        filesClient.requestUploads(sharedGroup, numberFiles = 15, jwt = jwtForDefaultUser).andExpect(status().isOk)
    }

    @Test
    fun `GIVEN a quota of 0 THEN writes are paused without a retry time`() {
        repeat(4) { newGroup() }
        val pausedGroup = newGroup()
        assertThat(pausedGroup, equalTo(PAUSED_GROUP_ID))

        val response = submitDefaultFilesExpectingTooManyRequests(pausedGroup)
            .andExpect(content().string(containsString("Writes are currently paused")))
            .andReturn().response
        assertThat(response.getHeader("Retry-After"), equalTo(null))
    }
}

@TestConfiguration
class BackendConfigWithSubmissionLimitsTestConfig {
    @Bean
    @Primary
    fun configWithSubmissionLimits(
        objectMapper: ObjectMapper,
        @Value("\${${BackendSpringProperty.BACKEND_CONFIG_PATH}}") configPath: String,
    ): BackendConfig = readBackendConfig(objectMapper = objectMapper, configPath = configPath).copy(
        submissionLimits = SubmissionLimits(
            maxOperationsPerDay = MAX_OPERATIONS,
            exemptGroupIds = setOf(EXEMPT_GROUP_ID),
            groupQuotas = mapOf(OWN_QUOTA_GROUP_ID to MAX_OPERATIONS, PAUSED_GROUP_ID to 0),
        ),
    )
}
