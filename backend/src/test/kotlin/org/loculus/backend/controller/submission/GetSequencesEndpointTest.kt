package org.loculus.backend.controller.submission

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.hasEntry
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.Status
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.PROCESSED
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_GROUP_NAME
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_USER_NAME
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.utils.Accession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class GetSequencesEndpointTest(
    @Autowired private val client: SubmissionControllerClient,
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse { client.getSequenceEntries(jwt = it) }
    }

    @Test
    fun `GIVEN data submitted by a group member THEN another group member sees the data`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        groupManagementClient.addUserToGroup(groupId, ALTERNATIVE_DEFAULT_USER_NAME).andExpect(status().isNoContent)

        convenienceClient.submitDefaultFiles(username = DEFAULT_USER_NAME, groupId = groupId)

        val sequencesOfUser = convenienceClient.getSequenceEntries(
            username = DEFAULT_USER_NAME,
        ).sequenceEntries

        assertThat(sequencesOfUser, hasSize(NUMBER_OF_SEQUENCES))

        val sequencesOfAlternativeUser = convenienceClient.getSequenceEntries(
            username = ALTERNATIVE_DEFAULT_USER_NAME,
        ).sequenceEntries

        assertThat(sequencesOfAlternativeUser, hasSize(NUMBER_OF_SEQUENCES))
    }

    @Test
    fun `GIVEN data submitted to a group WHEN querying another group THEN only shows entries of the given group`() {
        val firstGroupId = groupManagementClient.createNewGroup().andGetGroupId()
        val anotherGroupId = groupManagementClient.createNewGroup().andGetGroupId()

        convenienceClient.submitDefaultFiles(DEFAULT_USER_NAME, groupId = firstGroupId)

        val sequencesOfUser = convenienceClient.getSequenceEntries(
            username = DEFAULT_USER_NAME,
            groupIdsFilter = listOf(anotherGroupId),
        ).sequenceEntries

        assertThat(sequencesOfUser, hasSize(0))
    }

    @Test
    fun `WHEN querying for a non-existing group THEN expect an error that the group is not found`() {
        val nonExistingGroup = 123456789

        client.getSequenceEntries(
            groupIdsFilter = listOf(nonExistingGroup),
        )
            .andExpect(status().isNotFound)
            .andExpect(
                jsonPath("$.detail", containsString("Group(s) $nonExistingGroup do not exist.")),
            )
    }

    @Test
    fun `GIVEN some sequence entries in the database THEN only shows entries of the requested organism`() {
        val defaultOrganismData = convenienceClient.submitDefaultFiles(organism = DEFAULT_ORGANISM)
            .submissionIdMappings
        val otherOrganismData = convenienceClient.submitDefaultFiles(organism = OTHER_ORGANISM)
            .submissionIdMappings

        val sequencesOfUser = convenienceClient.getSequenceEntries(
            username = DEFAULT_USER_NAME,
            organism = OTHER_ORGANISM,
        ).sequenceEntries

        assertThat(
            sequencesOfUser.getAccessionVersions(),
            containsInAnyOrder(*otherOrganismData.getAccessionVersions().toTypedArray()),
        )
        assertThat(
            sequencesOfUser.getAccessionVersions().intersect(defaultOrganismData.getAccessionVersions().toSet()),
            `is`(empty()),
        )
    }

    @Test
    fun `WHEN querying sequences of an existing group that you're not a member of THEN this is forbidden`() {
        val groupIdOfDefaultUser = groupManagementClient.createNewGroup().andGetGroupId()

        client.getSequenceEntries(
            groupIdsFilter = listOf(groupIdOfDefaultUser),
            jwt = generateJwtFor(ALTERNATIVE_DEFAULT_USER_NAME),
        ).andExpect(status().isForbidden).andExpect {
            jsonPath(
                "$.detail",
                containsString(
                    "User $ALTERNATIVE_DEFAULT_USER_NAME is not " +
                        "a member of groups $ALTERNATIVE_DEFAULT_GROUP_NAME.",
                ),
            )
        }
    }

    @Test
    fun `WHEN superuser queries data of groups THEN returns sequence entries`() {
        val firstGroupId = groupManagementClient.createNewGroup().andGetGroupId()
        val secondGroupId = groupManagementClient.createNewGroup().andGetGroupId()

        val defaultGroupData = convenienceClient.submitDefaultFiles(
            username = DEFAULT_USER_NAME,
            groupId = firstGroupId,
        ).submissionIdMappings
        val otherGroupData = convenienceClient.submitDefaultFiles(
            username = DEFAULT_USER_NAME,
            groupId = secondGroupId,
        ).submissionIdMappings
        val accessionVersions = defaultGroupData + otherGroupData

        client.getSequenceEntries(
            groupIdsFilter = listOf(firstGroupId, secondGroupId),
            jwt = jwtForSuperUser,
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.statusCounts.RECEIVED").value(accessionVersions.size))
            .andExpect(
                jsonPath("\$.sequenceEntries.[*].accession", hasItem(defaultGroupData.first().accession)),
            )
            .andExpect(
                jsonPath("\$.sequenceEntries.[*].accession", hasItem(otherGroupData.first().accession)),
            )
    }

    @Test
    fun `WHEN superuser queries sequences without groupsFilter THEN returns sequence entries`() {
        val firstGroupId = groupManagementClient.createNewGroup().andGetGroupId()
        val secondGroupId = groupManagementClient.createNewGroup().andGetGroupId()

        val defaultGroupData = convenienceClient.submitDefaultFiles(
            username = DEFAULT_USER_NAME,
            groupId = firstGroupId,
        ).submissionIdMappings
        val otherGroupData = convenienceClient.submitDefaultFiles(
            username = DEFAULT_USER_NAME,
            groupId = secondGroupId,
        ).submissionIdMappings
        val accessionVersions = defaultGroupData + otherGroupData

        client.getSequenceEntries(
            groupIdsFilter = null,
            jwt = jwtForSuperUser,
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.statusCounts.RECEIVED").value(accessionVersions.size))
            .andExpect(
                jsonPath("\$.sequenceEntries.[*].accession", hasItem(defaultGroupData.first().accession)),
            )
            .andExpect(
                jsonPath("\$.sequenceEntries.[*].accession", hasItem(otherGroupData.first().accession)),
            )
    }

    @Test
    fun `GIVEN data in many statuses WHEN querying sequences for a certain one THEN return only those sequences`() {
        convenienceClient.prepareDataTo(PROCESSED)

        val sequencesInAwaitingApproval = convenienceClient
            .getSequenceEntries(statusesFilter = listOf(PROCESSED))
            .sequenceEntries

        assertThat(sequencesInAwaitingApproval, hasSize(10))

        val sequencesInProcessing = convenienceClient
            .getSequenceEntries(statusesFilter = listOf(IN_PROCESSING))
            .sequenceEntries

        assertThat(sequencesInProcessing, hasSize(0))
    }

    @Test
    fun `GIVEN data with warnings WHEN I exclude warnings THEN expect no data returned`() {
        val accessions = convenienceClient.prepareDefaultSequenceEntriesToInProcessing().map { it.accession }
        convenienceClient.submitProcessedData(PreparedProcessedData.withWarnings(accessions.first()))

        val sequencesInAwaitingApproval = convenienceClient.getSequenceEntries(
            username = ALTERNATIVE_DEFAULT_USER_NAME,
            statusesFilter = listOf(PROCESSED),
            processingResultFilter = listOf(ProcessingResult.HAS_ERRORS, ProcessingResult.NO_ISSUES),
        ).sequenceEntries

        assertThat(sequencesInAwaitingApproval, hasSize(0))
    }

    @Test
    fun `GIVEN data in many statuses WHEN querying sequences with pagination THEN return paged results`() {
        val allSubmittedSequencesSorted = convenienceClient.prepareDataTo(PROCESSED).map {
            it.accession to it.version
        }.sortedBy { it.first }
        convenienceClient.prepareDataTo(PROCESSED, errors = true)

        val resultForInAwaitingApprovalPageOne = convenienceClient.getSequenceEntries(
            statusesFilter = listOf(PROCESSED),
            processingResultFilter = listOf(ProcessingResult.NO_ISSUES, ProcessingResult.HAS_WARNINGS),
            page = 0,
            size = 5,
        )

        assertThat(resultForInAwaitingApprovalPageOne.sequenceEntries, hasSize(5))
        assertThat(resultForInAwaitingApprovalPageOne.statusCounts, hasEntry(PROCESSED, 20))
        assertThat(resultForInAwaitingApprovalPageOne.processingResultCounts, hasEntry(ProcessingResult.NO_ISSUES, 10))
        assertThat(resultForInAwaitingApprovalPageOne.processingResultCounts, hasEntry(ProcessingResult.HAS_ERRORS, 10))

        val resultForInAwaitingApprovalPageTwo = convenienceClient.getSequenceEntries(
            statusesFilter = listOf(PROCESSED),
            page = 1,
            size = 5,
        )

        val combinedResultSorted = (
            resultForInAwaitingApprovalPageOne.sequenceEntries +
                resultForInAwaitingApprovalPageTwo.sequenceEntries
            ).map { it.accession to it.version }.sortedBy { it.first }

        assertThat(combinedResultSorted, `is`(allSubmittedSequencesSorted))

        val generalResult = convenienceClient.getSequenceEntries()

        assertThat(generalResult.sequenceEntries, hasSize(20))
        assertThat(
            generalResult.statusCounts,
            `is`(
                mapOf(
                    RECEIVED to 0,
                    IN_PROCESSING to 0,
                    PROCESSED to 20,
                    APPROVED_FOR_RELEASE to 0,
                ),
            ),
        )
        assertThat(
            generalResult.processingResultCounts,
            `is`(
                mapOf(
                    ProcessingResult.HAS_ERRORS to 10,
                    ProcessingResult.HAS_WARNINGS to 0,
                    ProcessingResult.NO_ISSUES to 10,
                ),
            ),
        )
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideStatusScenarios")
    fun `GIVEN database in prepared state THEN returns sequence entries in expected status`(scenario: Scenario) {
        val accessions = scenario.prepareDatabase(convenienceClient)

        val sequencesOfUser = convenienceClient.getSequenceEntries(
            statusesFilter = listOf(scenario.expectedStatus),
        ).sequenceEntries

        val accessionVersionStatus =
            sequencesOfUser.find { it.accession == accessions.first() && it.version == scenario.expectedVersion }
        assertThat(accessionVersionStatus?.status, `is`(scenario.expectedStatus))
        assertThat(accessionVersionStatus?.isRevocation, `is`(scenario.expectedIsRevocation))
        assertThat(accessionVersionStatus?.hasErrors, `is`(scenario.expectedErrors))
    }

    companion object {
        @JvmStatic
        fun provideStatusScenarios() = listOf(
            Scenario(
                setupDescription = "I submitted sequence entries",
                prepareDatabase = { it.submitDefaultFiles().submissionIdMappings.map { entry -> entry.accession } },
                expectedStatus = RECEIVED,
                expectedErrors = false,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I started processing sequence entries",
                prepareDatabase = { it.prepareDefaultSequenceEntriesToInProcessing().map { entry -> entry.accession } },
                expectedStatus = IN_PROCESSING,
                expectedErrors = false,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted sequence entries that have errors",
                prepareDatabase = { it.prepareDefaultSequenceEntriesToHasErrors().map { entry -> entry.accession } },
                expectedStatus = PROCESSED,
                expectedErrors = true,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted sequence entries that have been successfully processed",
                prepareDatabase = { it.prepareDataTo(PROCESSED).map { entry -> entry.accession } },
                expectedStatus = PROCESSED,
                expectedErrors = false,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted, processed and approved sequence entries",
                prepareDatabase = { it.prepareDataTo(APPROVED_FOR_RELEASE).map { entry -> entry.accession } },
                expectedStatus = APPROVED_FOR_RELEASE,
                expectedErrors = false,
                expectedIsRevocation = false,
            ),
            Scenario(
                setupDescription = "I submitted a revocation",
                prepareDatabase = {
                    val accessionVersions = it.prepareDataTo(APPROVED_FOR_RELEASE)
                    val accessions = accessionVersions.map { entry -> entry.accession }
                    it.revokeSequenceEntries(accessions)
                    accessions
                },
                expectedStatus = PROCESSED,
                expectedErrors = false,
                expectedIsRevocation = true,
                expectedVersion = 2,
            ),
            Scenario(
                setupDescription = "I approved a revocation",
                prepareDatabase = { it.prepareRevokedSequenceEntries().map { entry -> entry.accession } },
                expectedStatus = APPROVED_FOR_RELEASE,
                expectedErrors = false,
                expectedIsRevocation = true,
                expectedVersion = 2,
            ),
        )
    }

    data class Scenario(
        val setupDescription: String,
        val expectedVersion: Long = 1,
        val prepareDatabase: (SubmissionConvenienceClient) -> List<Accession>,
        val expectedStatus: Status,
        val expectedErrors: Boolean,
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
