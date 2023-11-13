package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.SequenceEntryReview
import org.pathoplexus.backend.api.SequenceEntryStatus
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.SubmissionIdMapping
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.service.Accession
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

class SubmissionConvenienceClient(
    private val client: SubmissionControllerClient,
    private val objectMapper: ObjectMapper,
) {
    fun submitDefaultFiles(username: String = USER_NAME): List<SubmissionIdMapping> {
        val submit = client.submit(
            username,
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
        )

        return deserializeJsonResponse(submit)
    }

    fun prepareDefaultSequenceEntriesToInProcessing() {
        submitDefaultFiles()
        extractUnprocessedData()
    }

    fun submitProcessedData(vararg submittedProcessedData: SubmittedProcessedData) {
        client.submitProcessedData(*submittedProcessedData)
            .andExpect(status().isNoContent)
    }

    fun prepareDefaultSequenceEntriesToHasErrors() {
        prepareDefaultSequenceEntriesToInProcessing()
        DefaultFiles.allAccessions.forEach { accession ->
            client.submitProcessedData(PreparedProcessedData.withErrors(accession = accession))
        }
    }

    private fun prepareDefaultSequenceEntriesToAwaitingApproval() {
        prepareDefaultSequenceEntriesToInProcessing()
        client.submitProcessedData(
            *DefaultFiles.allAccessions.map {
                PreparedProcessedData.successfullyProcessed(accession = it)
            }.toTypedArray(),
        )
    }

    fun prepareDefaultSequenceEntriesToApprovedForRelease() {
        prepareDefaultSequenceEntriesToAwaitingApproval()

        approveProcessedSequenceEntries(
            DefaultFiles.allAccessions.map { AccessionVersion(it, 1L) },
        )
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

    fun prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation() {
        prepareDefaultSequenceEntriesToApprovedForRelease()
        revokeSequenceEntries(DefaultFiles.allAccessions)
    }

    fun extractUnprocessedData(numberOfSequenceEntries: Int = DefaultFiles.NUMBER_OF_SEQUENCES) =
        client.extractUnprocessedData(numberOfSequenceEntries)
            .expectNdjsonAndGetContent<UnprocessedData>()

    fun prepareDatabaseWith(
        vararg processedData: SubmittedProcessedData,
    ) {
        submitDefaultFiles()
        extractUnprocessedData()
        client.submitProcessedData(*processedData)
    }

    fun getSequenceEntriesOfUser(userName: String = USER_NAME): List<SequenceEntryStatus> {
        return deserializeJsonResponse(client.getSequenceEntriesOfUser(userName))
    }

    fun getSequenceEntriesOfUserInState(
        userName: String = USER_NAME,
        status: Status,
    ): List<SequenceEntryStatus> = getSequenceEntriesOfUser(userName).filter { it.status == status }

    fun getSequenceEntryOfUser(
        accessionVersion: AccessionVersion,
        userName: String = USER_NAME,
    ) = getSequenceEntryOfUser(accessionVersion.accession, accessionVersion.version, userName)

    fun getSequenceEntryOfUser(
        accession: Accession,
        version: Long,
        userName: String = USER_NAME,
    ): SequenceEntryStatus {
        val sequencesOfUser = getSequenceEntriesOfUser(userName)

        return sequencesOfUser.find { it.accession == accession && it.version == version }
            ?: error("Did not find $accession.$version for $userName")
    }

    fun getSequenceEntryThatNeedsReview(
        accession: Accession,
        version: Long,
        userName: String = USER_NAME,
    ): SequenceEntryReview =
        deserializeJsonResponse(client.getSequenceEntryThatNeedsReview(accession, version, userName))

    fun submitDefaultReviewedData(
        userName: String = USER_NAME,
    ) {
        DefaultFiles.allAccessions.forEach { accession ->
            client.submitReviewedSequenceEntry(
                userName,
                UnprocessedData(accession, 1L, defaultOriginalData),
            )
        }
    }

    fun approveProcessedSequenceEntries(listOfSequencesToApprove: List<AccessionVersion>) {
        client.approveProcessedSequenceEntries(listOfSequencesToApprove)
            .andExpect(status().isNoContent)
    }

    fun reviseDefaultProcessedSequenceEntries(): List<SubmissionIdMapping> {
        val result = client.reviseSequenceEntries(
            DefaultFiles.revisedMetadataFile,
            DefaultFiles.sequencesFile,
        ).andExpect(status().isOk)

        return deserializeJsonResponse(result)
    }

    fun revokeSequenceEntries(listOfSequencesToRevoke: List<Accession>): List<SequenceEntryStatus> =
        deserializeJsonResponse(client.revokeSequenceEntries(listOfSequencesToRevoke))

    fun confirmRevocation(listOfSequencesToConfirm: List<AccessionVersion>) {
        client.confirmRevocation(listOfSequencesToConfirm)
            .andExpect(status().isNoContent)
    }

    fun prepareDataTo(status: Status) {
        when (status) {
            Status.RECEIVED -> submitDefaultFiles()
            Status.IN_PROCESSING -> prepareDefaultSequenceEntriesToInProcessing()
            Status.HAS_ERRORS -> prepareDefaultSequenceEntriesToHasErrors()
            Status.AWAITING_APPROVAL -> prepareDefaultSequenceEntriesToAwaitingApproval()
            Status.APPROVED_FOR_RELEASE -> prepareDefaultSequenceEntriesToApprovedForRelease()
            Status.AWAITING_APPROVAL_FOR_REVOCATION -> prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation()
        }
    }

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
