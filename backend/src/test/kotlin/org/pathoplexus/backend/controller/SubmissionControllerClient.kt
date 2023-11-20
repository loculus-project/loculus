package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.service.Accession
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post

const val USER_NAME = "testUser"

class SubmissionControllerClient(private val mockMvc: MockMvc, private val objectMapper: ObjectMapper) {
    fun submit(
        username: String,
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions =
        mockMvc.perform(
            multipart(addOrganismToPath("/submit", organism = organism))
                .file(sequencesFile)
                .file(metadataFile)
                .param("username", username),
        )

    fun extractUnprocessedData(numberOfSequenceEntries: Int, organism: String = DEFAULT_ORGANISM): ResultActions =
        mockMvc.perform(
            post(addOrganismToPath("/extract-unprocessed-data", organism = organism))
                .param("numberOfSequenceEntries", numberOfSequenceEntries.toString()),
        )

    fun submitProcessedData(
        vararg submittedProcessedData: SubmittedProcessedData,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions {
        val stringContent = submittedProcessedData.joinToString("\n") { objectMapper.writeValueAsString(it) }

        return submitProcessedDataRaw(stringContent, organism)
    }

    fun submitProcessedDataRaw(submittedProcessedData: String, organism: String = DEFAULT_ORGANISM): ResultActions =
        mockMvc.perform(
            post(addOrganismToPath("/submit-processed-data", organism = organism))
                .contentType(MediaType.APPLICATION_NDJSON_VALUE)
                .content(submittedProcessedData),
        )

    fun getSequenceEntriesOfUser(userName: String, organism: String = DEFAULT_ORGANISM): ResultActions =
        mockMvc.perform(
            get(addOrganismToPath("/get-sequences-of-user", organism = organism))
                .param("username", userName),
        )

    fun getSequenceEntryThatNeedsReview(
        accession: Accession,
        version: Long,
        userName: String,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions =
        mockMvc.perform(
            get(addOrganismToPath("/get-data-to-review/$accession/$version", organism = organism))
                .param("username", userName),
        )

    fun getNumberOfSequenceEntriesThatNeedReview(
        userName: String,
        numberOfSequences: Int,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions =
        mockMvc.perform(
            get(addOrganismToPath("/get-data-to-review", organism = organism))
                .param("username", userName)
                .param("numberOfSequenceEntries", numberOfSequences.toString()),
        )

    fun submitReviewedSequenceEntry(
        userName: String,
        reviewedData: UnprocessedData,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions {
        return mockMvc.perform(
            post(addOrganismToPath("/submit-reviewed-sequence", organism = organism))
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(reviewedData)),
        )
    }

    fun approveProcessedSequenceEntries(
        listOfSequencesToApprove: List<AccessionVersion>,
        userName: String = USER_NAME,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions =
        mockMvc.perform(
            post(addOrganismToPath("/approve-processed-data", organism = organism))
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"accessionVersions":${objectMapper.writeValueAsString(listOfSequencesToApprove)}}"""),
        )

    fun revokeSequenceEntries(
        listOfSequenceEntriesToRevoke: List<Accession>,
        userName: String = USER_NAME,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions =
        mockMvc.perform(
            post(addOrganismToPath("/revoke", organism = organism))
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"accessions":$listOfSequenceEntriesToRevoke}"""),
        )

    fun confirmRevocation(
        listOfSequencesToConfirm: List<AccessionVersion>,
        userName: String = USER_NAME,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions =
        mockMvc.perform(
            post(addOrganismToPath("/confirm-revocation", organism = organism))
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"accessionVersions":${objectMapper.writeValueAsString(listOfSequencesToConfirm)}}"""),
        )

    fun getReleasedData(organism: String = DEFAULT_ORGANISM): ResultActions =
        mockMvc.perform(
            get(addOrganismToPath("/get-released-data", organism = organism)),
        )

    fun deleteSequenceEntries(
        listOfAccessionVersionsToDelete: List<AccessionVersion>,
        userName: String = USER_NAME,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions =
        mockMvc.perform(
            delete(addOrganismToPath("/delete-sequences", organism = organism))
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"accessionVersions":${objectMapper.writeValueAsString(listOfAccessionVersionsToDelete)}}""",
                ),
        )

    fun reviseSequenceEntries(
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile,
        username: String = USER_NAME,
        organism: String = DEFAULT_ORGANISM,
    ): ResultActions =
        mockMvc.perform(
            multipart(addOrganismToPath("/revise", organism = organism))
                .file(sequencesFile)
                .file(metadataFile)
                .param("username", username),
        )
}
