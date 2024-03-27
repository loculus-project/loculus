package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.hamcrest.CoreMatchers.equalTo
import org.hamcrest.MatcherAssert.assertThat
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.ApproveDataScope
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.GetSequenceResponse
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.SequenceEntryVersionToEdit
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.api.WarningsFilter
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.utils.Accession
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

class SubmissionConvenienceClient(
    private val backendConfig: BackendConfig,
    private val client: SubmissionControllerClient,
    private val objectMapper: ObjectMapper,
) {
    fun submitDefaultFiles(
        username: String = DEFAULT_USER_NAME,
        groupName: String = DEFAULT_GROUP_NAME,
        organism: String = DEFAULT_ORGANISM,
        dataUseTerms: DataUseTerms = DataUseTerms.Open,
    ): List<SubmissionIdMapping> {
        val isMultiSegmented = backendConfig
            .getInstanceConfig(Organism(organism))
            .referenceGenomes
            .nucleotideSequences.size > 1

        val submit = client.submit(
            DefaultFiles.metadataFile,
            if (isMultiSegmented) {
                DefaultFiles.sequencesFileMultiSegmented
            } else {
                DefaultFiles.sequencesFile
            },
            organism = organism,
            groupName = groupName,
            dataUseTerm = dataUseTerms,
            jwt = generateJwtFor(username),
        )

        return deserializeJsonResponse(submit)
    }

    fun prepareDefaultSequenceEntriesToInProcessing(
        organism: String = DEFAULT_ORGANISM,
        username: String = DEFAULT_USER_NAME,
        groupName: String = DEFAULT_GROUP_NAME,
    ): List<AccessionVersionInterface> {
        submitDefaultFiles(organism = organism, username = username, groupName = groupName)
        return extractUnprocessedData(organism = organism).getAccessionVersions()
    }

    fun submitProcessedData(
        submittedProcessedData: List<SubmittedProcessedData>,
        organism: String = DEFAULT_ORGANISM,
    ) {
        submitProcessedData(*submittedProcessedData.toTypedArray(), organism = organism)
    }

    fun submitProcessedData(
        vararg submittedProcessedData: SubmittedProcessedData,
        organism: String = DEFAULT_ORGANISM,
    ) {
        client.submitProcessedData(*submittedProcessedData, organism = organism)
            .andExpect(status().isNoContent)
    }

    fun prepareDefaultSequenceEntriesToHasErrors(
        organism: String = DEFAULT_ORGANISM,
        username: String = DEFAULT_USER_NAME,
        groupName: String = DEFAULT_GROUP_NAME,
    ): List<AccessionVersionInterface> {
        val accessionVersions =
            prepareDefaultSequenceEntriesToInProcessing(organism = organism, username = username, groupName = groupName)
        submitProcessedData(
            accessionVersions.map {
                PreparedProcessedData.withErrors(accession = it.accession)
            },
            organism = organism,
        )
        return accessionVersions
    }

    private fun prepareDefaultSequenceEntriesToAwaitingApproval(
        organism: String = DEFAULT_ORGANISM,
        username: String = DEFAULT_USER_NAME,
        groupName: String = DEFAULT_GROUP_NAME,
    ): List<AccessionVersionInterface> {
        val accessionVersions =
            prepareDefaultSequenceEntriesToInProcessing(organism = organism, username = username, groupName = groupName)
        submitProcessedData(
            *accessionVersions.map {
                when (organism) {
                    DEFAULT_ORGANISM -> PreparedProcessedData.successfullyProcessed(accession = it.accession)
                    OTHER_ORGANISM -> PreparedProcessedData.successfullyProcessedOtherOrganismData(
                        accession = it.accession,
                    )

                    else -> throw Exception("Test issue: There is no mapping of processed data for organism $organism")
                }
            }.toTypedArray(),
            organism = organism,
        )
        return accessionVersions
    }

    fun prepareDefaultSequenceEntriesToApprovedForRelease(
        organism: String = DEFAULT_ORGANISM,
        username: String = DEFAULT_USER_NAME,
        groupName: String = DEFAULT_GROUP_NAME,
    ): List<AccessionVersionInterface> {
        val accessionVersions = prepareDefaultSequenceEntriesToAwaitingApproval(
            organism = organism,
            username = username,
            groupName = groupName,
        )

        approveProcessedSequenceEntries(
            accessionVersions.map { AccessionVersion(it.accession, it.version) },
            organism = organism,
            username = username,
        )
        return accessionVersions
    }

    fun reviseAndProcessDefaultSequenceEntries(accessions: List<Accession>) {
        reviseDefaultProcessedSequenceEntries(accessions)
        val extractedAccessionVersions = extractUnprocessedData().map { AccessionVersion(it.accession, it.version) }
        submitProcessedData(
            extractedAccessionVersions
                .map { PreparedProcessedData.successfullyProcessed(accession = it.accession, version = it.version) },
        )
        approveProcessedSequenceEntries(extractedAccessionVersions)
    }

    fun prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation(
        organism: String = DEFAULT_ORGANISM,
        username: String = DEFAULT_USER_NAME,
        groupName: String = DEFAULT_GROUP_NAME,
    ): List<SubmissionIdMapping> {
        val accessionVersions = prepareDefaultSequenceEntriesToApprovedForRelease(
            organism = organism,
            username = username,
            groupName = groupName,
        )
        return revokeSequenceEntries(accessionVersions.map { it.accession }, organism = organism, username = username)
    }

    fun prepareRevokedSequenceEntries(organism: String = DEFAULT_ORGANISM): List<AccessionVersionInterface> {
        val accessionVersions = prepareDataTo(Status.APPROVED_FOR_RELEASE, organism = organism)
        val revocationVersions = revokeSequenceEntries(accessionVersions.map { it.accession }, organism = organism)
        return approveProcessedSequenceEntries(revocationVersions, organism = organism)
    }

    fun extractUnprocessedData(
        numberOfSequenceEntries: Int = DefaultFiles.NUMBER_OF_SEQUENCES,
        organism: String = DEFAULT_ORGANISM,
    ) = client.extractUnprocessedData(numberOfSequenceEntries, organism)
        .expectNdjsonAndGetContent<UnprocessedData>()

    fun getSequenceEntries(
        username: String = DEFAULT_USER_NAME,
        groupsFilter: List<String>? = null,
        statusesFilter: List<Status>? = null,
        organism: String = DEFAULT_ORGANISM,
        warningsFilter: WarningsFilter = WarningsFilter.INCLUDE_WARNINGS,
        page: Int? = null,
        size: Int? = null,
    ): GetSequenceResponse = deserializeJsonResponse(
        client.getSequenceEntries(
            organism = organism,
            groupsFilter = groupsFilter,
            statusesFilter = statusesFilter,
            warningsFilter = warningsFilter,
            jwt = generateJwtFor(username),
            page = page,
            size = size,
        ),
    )

    fun getSequenceEntriesOfUserInState(
        userName: String = DEFAULT_USER_NAME,
        status: Status,
    ): List<SequenceEntryStatus> = getSequenceEntries(
        username = userName,
        statusesFilter = listOf(status),
    ).sequenceEntries

    fun getSequenceEntry(accessionVersion: AccessionVersionInterface, userName: String = DEFAULT_USER_NAME) =
        getSequenceEntry(accessionVersion.accession, accessionVersion.version, userName)

    fun getSequenceEntry(
        accession: Accession,
        version: Long,
        userName: String = DEFAULT_USER_NAME,
        groupName: String = DEFAULT_GROUP_NAME,
        organism: String = DEFAULT_ORGANISM,
    ): SequenceEntryStatus {
        val sequencesOfUser = getSequenceEntries(
            userName,
            groupsFilter = listOf(groupName),
            organism = organism,
        ).sequenceEntries

        return sequencesOfUser.find { it.accession == accession && it.version == version }
            ?: error("Did not find $accession.$version for $userName")
    }

    fun getSequenceEntryToEdit(
        accession: Accession,
        version: Long,
        userName: String = DEFAULT_USER_NAME,
    ): SequenceEntryVersionToEdit = deserializeJsonResponse(
        client.getSequenceEntryToEdit(
            accession = accession,
            version = version,
            jwt = generateJwtFor(userName),
        ),
    )

    fun expectStatusCountsOfSequenceEntries(statusCounts: Map<Status, Int>, userName: String = DEFAULT_USER_NAME) {
        val actualStatusCounts = deserializeJsonResponse<GetSequenceResponse>(
            client.getSequenceEntries(jwt = generateJwtFor(userName))
                .andExpect(status().isOk)
                .andExpect(
                    content().contentType(MediaType.APPLICATION_JSON_VALUE),
                ),
        ).statusCounts

        assertThat(
            actualStatusCounts,
            equalTo(Status.entries.associateWith { 0 } + statusCounts),
        )
    }

    fun submitDefaultEditedData(accessions: List<Accession>, userName: String = DEFAULT_USER_NAME) {
        accessions.forEach { accession ->
            client.submitEditedSequenceEntryVersion(
                UnprocessedData(accession, 1L, defaultOriginalData),
                jwt = generateJwtFor(userName),
            )
        }
    }

    fun approveProcessedSequenceEntries(
        accessionVersionsFilter: List<AccessionVersionInterface>,
        organism: String = DEFAULT_ORGANISM,
        username: String = DEFAULT_USER_NAME,
    ): List<AccessionVersion> {
        return deserializeJsonResponse(
            client
                .approveProcessedSequenceEntries(
                    scope = ApproveDataScope.ALL,
                    accessionVersionsFilter = accessionVersionsFilter,
                    organism = organism,
                    jwt = generateJwtFor(username),
                )
                .andExpect(status().isOk),
        )
    }

    fun reviseDefaultProcessedSequenceEntries(
        accessions: List<Accession>,
        organism: String = DEFAULT_ORGANISM,
    ): List<SubmissionIdMapping> {
        val result = client.reviseSequenceEntries(
            DefaultFiles.getRevisedMetadataFile(accessions),
            DefaultFiles.sequencesFile,
            organism = organism,
        ).andExpect(status().isOk)

        return deserializeJsonResponse(result)
    }

    fun revokeSequenceEntries(
        listOfAccessionsToRevoke: List<Accession>,
        organism: String = DEFAULT_ORGANISM,
        username: String = DEFAULT_USER_NAME,
    ): List<SubmissionIdMapping> = deserializeJsonResponse(
        client.revokeSequenceEntries(
            listOfAccessionsToRevoke,
            organism = organism,
            jwt = generateJwtFor(username),
        ),
    )

    fun prepareDataTo(
        status: Status,
        organism: String = DEFAULT_ORGANISM,
        username: String = DEFAULT_USER_NAME,
        groupName: String = DEFAULT_GROUP_NAME,
    ): List<AccessionVersionInterface> {
        return when (status) {
            Status.RECEIVED -> submitDefaultFiles(organism = organism, username = username, groupName = groupName)
            Status.IN_PROCESSING -> prepareDefaultSequenceEntriesToInProcessing(
                organism = organism,
                username = username,
                groupName = groupName,
            )

            Status.HAS_ERRORS -> prepareDefaultSequenceEntriesToHasErrors(
                organism = organism,
                username = username,
                groupName = groupName,
            )

            Status.AWAITING_APPROVAL -> prepareDefaultSequenceEntriesToAwaitingApproval(
                organism = organism,
                username = username,
                groupName = groupName,
            )

            Status.APPROVED_FOR_RELEASE -> prepareDefaultSequenceEntriesToApprovedForRelease(
                organism = organism,
                username = username,
                groupName = groupName,
            )

            else -> throw Exception("Test issue: No data preparation defined for status $status")
        }
    }

    fun getReleasedData(organism: String = DEFAULT_ORGANISM) =
        client.getReleasedData(organism).expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()

    private inline fun <reified T> deserializeJsonResponse(resultActions: ResultActions): T {
        val content =
            resultActions
                .andExpect(status().isOk)
                .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
                .andReturn()
                .response
                .contentAsString
        return objectMapper.readValue(content)
    }
}
