package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.node.BooleanNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.TextNode
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.CoreMatchers.not
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.matchesPattern
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.InsdcIngestGroupId
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DATA_USE_TERMS_DISABLED_CONFIG
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_GROUP_CHANGED
import org.loculus.backend.controller.DEFAULT_GROUP_NAME_CHANGED
import org.loculus.backend.controller.DEFAULT_PIPELINE_VERSION
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import kotlin.time.Clock

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$DATA_USE_TERMS_DISABLED_CONFIG"],
)
class GetReleasedDataDataUseTermsDisabledEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
    @Autowired private val groupClient: GroupManagementControllerClient,
    @Autowired private val backendConfig: BackendConfig,
) {
    private val currentDate = Clock.System.now().toLocalDateTime(DateProvider.timeZone).date.toString()

    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @Test
    fun `config has been read and data use terms are configured to be off`() {
        assertThat(backendConfig.dataUseTerms.enabled, `is`(false))
    }

    @Test
    fun `GIVEN released data exists THEN NOT returns data use terms properties`() {
        val groupId = groupClient.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)

        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()

        responseBody.forEach {
            assertThat(it.metadata.keys, not(hasItem("dataUseTerms")))
            assertThat(it.metadata.keys, not(hasItem("dataUseTermsRestrictedUntil")))
        }
    }

    @Test
    fun `GIVEN released data called with enaDeposition=true THEN InsdcIngestGroupId data is excluded`() {
        val groupId = groupClient.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = InsdcIngestGroupId)

        val response = submissionControllerClient.getReleasedData(filterForEnaDeposition = "true")
        val responseBody = response.expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()

        responseBody.forEach {
            assertThat(it.metadata["groupId"], not(`is`(InsdcIngestGroupId)))
        }
    }

    @Test
    fun `GIVEN released data exists THEN returns with additional metadata fields & no data use terms properties`() {
        val groupId = groupClient.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)

        groupClient.updateGroup(
            groupId = groupId,
            group = DEFAULT_GROUP_CHANGED,
            jwt = jwtForDefaultUser,
        ).andExpect(status().isOk)

        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()

        assertThat(responseBody.size, `is`(NUMBER_OF_SEQUENCES))

        response.andExpect(header().string("x-total-records", NUMBER_OF_SEQUENCES.toString()))

        responseBody.forEach {
            val id = it.metadata["accession"]!!.asText()
            val version = it.metadata["version"]!!.asLong()
            assertThat(version, `is`(1))

            val expectedMetadata = defaultProcessedData.metadata + mapOf(
                "accession" to TextNode(id),
                "version" to IntNode(version.toInt()),
                "accessionVersion" to TextNode("$id.$version"),
                "isRevocation" to BooleanNode.FALSE,
                "submitter" to TextNode(DEFAULT_USER_NAME),
                "groupName" to TextNode(DEFAULT_GROUP_NAME_CHANGED),
                "versionStatus" to TextNode("LATEST_VERSION"),
                "releasedDate" to TextNode(currentDate),
                "submittedDate" to TextNode(currentDate),
                "pipelineVersion" to IntNode(DEFAULT_PIPELINE_VERSION.toInt()),
            )

            for ((key, value) in it.metadata) {
                when (key) {
                    "submittedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)

                    "releasedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)

                    "submissionId" -> assertThat(value.textValue(), matchesPattern("^custom\\d$"))

                    "groupId" -> assertThat(value.intValue(), `is`(groupId))

                    else -> {
                        assertThat(expectedMetadata.keys, hasItem(key))
                        assertThat(value, `is`(expectedMetadata[key]))
                    }
                }
            }
            assertThat(it.alignedNucleotideSequences, `is`(defaultProcessedData.alignedNucleotideSequences))
            assertThat(it.unalignedNucleotideSequences, `is`(defaultProcessedData.unalignedNucleotideSequences))
            assertThat(it.alignedAminoAcidSequences, `is`(defaultProcessedData.alignedAminoAcidSequences))
            assertThat(it.nucleotideInsertions, `is`(defaultProcessedData.nucleotideInsertions))
            assertThat(it.aminoAcidInsertions, `is`(defaultProcessedData.aminoAcidInsertions))
        }
    }
}
