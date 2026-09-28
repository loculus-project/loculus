package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.SubmissionLimits
import org.loculus.backend.config.readBackendConfig
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

// The default submission contains 10 sequence entries.
private const val MAX_NEW_SEQUENCE_ENTRIES = 15L
private const val MAX_REVISIONS = 5L
private const val MAX_FILE_UPLOAD_REQUESTS = 3L

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
) {

    @Test
    fun `GIVEN an upload that would exceed the daily limit of new entries THEN the whole upload is rejected`() {
        val groupId = groupManagementClient.createNewGroup(group = DEFAULT_GROUP).andGetGroupId()
        convenienceClient.submitDefaultFiles(groupId = groupId)

        submissionControllerClient.submit(DefaultFiles.metadataFile, DefaultFiles.sequencesFile, groupId = groupId)
            .andExpect(status().isTooManyRequests)
            .andExpect(content().string(containsString("at most $MAX_NEW_SEQUENCE_ENTRIES new sequence entries")))
            .andExpect(content().string(containsString("10 have been created")))

        assertThat(convenienceClient.getSequenceEntries().sequenceEntries, hasSize(10))
    }

    @Test
    fun `GIVEN a revision exceeding the daily limit of revisions THEN it is rejected`() {
        val accessions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map { it.accession }

        submissionControllerClient.reviseSequenceEntries(
            DefaultFiles.getRevisedMetadataFile(accessions),
            DefaultFiles.sequencesFile,
        )
            .andExpect(status().isTooManyRequests)
            .andExpect(content().string(containsString("at most $MAX_REVISIONS revisions")))
    }

    @Test
    fun `GIVEN file upload requests exceeding the daily limit THEN they are rejected`() {
        val groupId = groupManagementClient.createNewGroup(group = DEFAULT_GROUP).andGetGroupId()

        filesClient.requestUploads(groupId, numberFiles = 2, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
        filesClient.requestUploads(groupId, numberFiles = 2, jwt = jwtForDefaultUser)
            .andExpect(status().isTooManyRequests)
        filesClient.requestMultipartUploads(groupId, numberFiles = 2)
            .andExpect(status().isTooManyRequests)
        filesClient.requestUploads(groupId, numberFiles = 1, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
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
            maxNewSequenceEntriesPerDay = MAX_NEW_SEQUENCE_ENTRIES,
            maxRevisionsPerDay = MAX_REVISIONS,
            maxFileUploadRequestsPerDay = MAX_FILE_UPLOAD_REQUESTS,
        ),
    )
}
