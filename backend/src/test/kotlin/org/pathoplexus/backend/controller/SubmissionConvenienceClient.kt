package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.AccessionVersionInterface
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.SequenceEntryStatus
import org.pathoplexus.backend.api.SequenceEntryVersionToEdit
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.SubmissionIdMapping
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.utils.Accession
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

class SubmissionConvenienceClient(
    private val client: SubmissionControllerClient,
    private val objectMapper: ObjectMapper,
) {
    fun submitDefaultFiles(
        username: String = USER_NAME,
        organism: String = DEFAULT_ORGANISM,
    ): List<SubmissionIdMapping> {
        val submit = client.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            organism = organism,
            jwt = generateJwtForUser(username),
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
        vararg submittedProcessedData: SubmittedProcessedData,
        organism: String = DEFAULT_ORGANISM,
    ) {
        client.submitProcessedData(*submittedProcessedData, organism = organism)
            .andExpect(status().isNoContent)
    }

    fun prepareDefaultSequenceEntriesToHasErrors(organism: String = DEFAULT_ORGANISM): List<AccessionVersionInterface> {
        val accessionVersions = prepareDefaultSequenceEntriesToInProcessing(organism = organism)
        submitProcessedData(
            *accessionVersions.map {
                PreparedProcessedData.withErrors(accession = it.accession)
            }.toTypedArray(),
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

    fun reviseAndProcessDefaultSequenceEntries() {
        reviseDefaultProcessedSequenceEntries()
        val extractedAccessionVersions = extractUnprocessedData().map { AccessionVersion(it.accession, it.version) }
        submitProcessedData(
            *extractedAccessionVersions
                .map { PreparedProcessedData.successfullyProcessed(accession = it.accession, version = it.version) }
                .toTypedArray(),
        )
        approveProcessedSequenceEntries(extractedAccessionVersions)
    }

    fun prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation(
        organism: String = DEFAULT_ORGANISM,
    ): List<SequenceEntryStatus> {
        val accessionVersions = prepareDefaultSequenceEntriesToApprovedForRelease(organism = organism)
        return revokeSequenceEntries(accessionVersions.map { it.accession }, organism = organism)
    }

    fun extractUnprocessedData(
        numberOfSequenceEntries: Int = DefaultFiles.NUMBER_OF_SEQUENCES,
        organism: String = DEFAULT_ORGANISM,
    ) = client.extractUnprocessedData(numberOfSequenceEntries, organism)
        .expectNdjsonAndGetContent<UnprocessedData>()

    fun prepareDatabaseWith(vararg processedData: SubmittedProcessedData) {
        submitDefaultFiles()
        extractUnprocessedData()
        client.submitProcessedData(*processedData)
    }

    fun getSequenceEntriesOfUser(
        username: String = USER_NAME,
        organism: String = DEFAULT_ORGANISM,
    ): List<SequenceEntryStatus> {
        return deserializeJsonResponse(
            client.getSequenceEntriesOfUser(
                organism = organism,
                jwt = generateJwtForUser(username),
            ),
        )
    }

    fun getSequenceEntriesOfUserInState(userName: String = USER_NAME, status: Status): List<SequenceEntryStatus> =
        getSequenceEntriesOfUser(userName).filter { it.status == status }

    fun getSequenceEntryOfUser(accessionVersion: AccessionVersion, userName: String = USER_NAME) =
        getSequenceEntryOfUser(accessionVersion.accession, accessionVersion.version, userName)

    fun getSequenceEntryOfUser(
        accession: Accession,
        version: Long,
        userName: String = USER_NAME,
        organism: String = DEFAULT_ORGANISM,
    ): SequenceEntryStatus {
        val sequencesOfUser = getSequenceEntriesOfUser(userName, organism = organism)

        return sequencesOfUser.find { it.accession == accession && it.version == version }
            ?: error("Did not find $accession.$version for $userName")
    }

    fun getSequenceEntryThatHasErrors(
        accession: Accession,
        version: Long,
        userName: String = USER_NAME,
    ): SequenceEntryVersionToEdit = deserializeJsonResponse(
        client.getSequenceEntryThatHasErrors(
            accession = accession,
            version = version,
            jwt = generateJwtForUser(userName),
        ),
    )

    fun submitDefaultEditedData(userName: String = USER_NAME) {
        DefaultFiles.allAccessions.forEach { accession ->
            client.submitEditedSequenceEntryVersion(
                UnprocessedData(accession, 1L, defaultOriginalData),
                jwt = generateJwtForUser(userName),
            )
        }
    }

    fun approveProcessedSequenceEntries(
        listOfSequencesToApprove: List<AccessionVersion>,
        organism: String = DEFAULT_ORGANISM,
    ) {
        client.approveProcessedSequenceEntries(listOfSequencesToApprove, organism = organism)
            .andExpect(status().isNoContent)
    }

    fun reviseDefaultProcessedSequenceEntries(organism: String = DEFAULT_ORGANISM): List<SubmissionIdMapping> {
        val result = client.reviseSequenceEntries(
            DefaultFiles.revisedMetadataFile,
            DefaultFiles.sequencesFile,
            organism = organism,
        ).andExpect(status().isOk)

        return deserializeJsonResponse(result)
    }

    fun revokeSequenceEntries(
        listOfSequencesToRevoke: List<Accession>,
        organism: String = DEFAULT_ORGANISM,
    ): List<SequenceEntryStatus> =
        deserializeJsonResponse(client.revokeSequenceEntries(listOfSequencesToRevoke, organism = organism))

    fun confirmRevocation(listOfSequencesToConfirm: List<AccessionVersion>) {
        client.confirmRevocation(listOfSequencesToConfirm)
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
