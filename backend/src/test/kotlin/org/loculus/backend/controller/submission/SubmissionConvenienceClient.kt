package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.hamcrest.CoreMatchers.equalTo
import org.hamcrest.MatcherAssert.assertThat
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.DataUseTerms
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
    ): List<AccessionVersionInterface> {
        submitDefaultFiles(organism = organism)
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

    fun prepareDefaultSequenceEntriesToHasErrors(organism: String = DEFAULT_ORGANISM): List<AccessionVersionInterface> {
        val accessionVersions = prepareDefaultSequenceEntriesToInProcessing(organism = organism)
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
    ): List<AccessionVersionInterface> {
        val accessionVersions = prepareDefaultSequenceEntriesToInProcessing(organism = organism)
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
    ): List<AccessionVersionInterface> {
        val accessionVersions = prepareDefaultSequenceEntriesToAwaitingApproval(organism = organism)

        approveProcessedSequenceEntries(
            accessionVersions.map { AccessionVersion(it.accession, it.version) },
            organism = organism,
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
    ): List<SubmissionIdMapping> {
        val accessionVersions = prepareDefaultSequenceEntriesToApprovedForRelease(organism = organism)
        return revokeSequenceEntries(accessionVersions.map { it.accession }, organism = organism)
    }

    fun prepareRevokedSequenceEntries(organism: String = DEFAULT_ORGANISM): List<AccessionVersionInterface> {
        val accessionVersions = prepareDataTo(Status.AWAITING_APPROVAL_FOR_REVOCATION, organism = organism)
        confirmRevocation(accessionVersions, organism = organism)
        return accessionVersions
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

    fun getSequenceEntryOfUser(accessionVersion: AccessionVersion, userName: String = DEFAULT_USER_NAME) =
        getSequenceEntryOfUser(accessionVersion.accession, accessionVersion.version, userName)

    fun getSequenceEntryOfUser(
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

    fun getSequenceEntryThatHasErrors(
        accession: Accession,
        version: Long,
        userName: String = DEFAULT_USER_NAME,
    ): SequenceEntryVersionToEdit = deserializeJsonResponse(
        client.getSequenceEntryThatHasErrors(
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
        listOfSequencesToApprove: List<AccessionVersionInterface>,
        organism: String = DEFAULT_ORGANISM,
    ) {
        client.approveProcessedSequenceEntries(
            listOfSequencesToApprove.map {
                AccessionVersion(
                    it.accession,
                    it.version,
                )
            },
            organism = organism,
        )
            .andExpect(status().isOk)
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
    ): List<SubmissionIdMapping> =
        deserializeJsonResponse(client.revokeSequenceEntries(listOfAccessionsToRevoke, organism = organism))

    fun confirmRevocation(
        listOfSequencesToConfirm: List<AccessionVersionInterface>,
        organism: String = DEFAULT_ORGANISM,
    ) {
        client.confirmRevocation(listOfSequencesToConfirm.map { AccessionVersion(it.accession, it.version) }, organism)
            .andExpect(status().isNoContent)
    }

    fun prepareDataTo(status: Status, organism: String = DEFAULT_ORGANISM): List<AccessionVersionInterface> {
        return when (status) {
            Status.RECEIVED -> submitDefaultFiles(organism = organism)
            Status.IN_PROCESSING -> prepareDefaultSequenceEntriesToInProcessing(organism = organism)
            Status.HAS_ERRORS -> prepareDefaultSequenceEntriesToHasErrors(organism = organism)
            Status.AWAITING_APPROVAL -> prepareDefaultSequenceEntriesToAwaitingApproval(organism = organism)
            Status.APPROVED_FOR_RELEASE -> prepareDefaultSequenceEntriesToApprovedForRelease(organism = organism)
            Status.AWAITING_APPROVAL_FOR_REVOCATION -> prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation(
                organism = organism,
            )
        }
    }

    fun getReleasedData(organism: String = DEFAULT_ORGANISM) =
        client.getReleasedData(organism).expectNdjsonAndGetContent<ProcessedData>()

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
