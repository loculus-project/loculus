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
    fun submit(username: String, metadataFile: MockMultipartFile, sequencesFile: MockMultipartFile): ResultActions =
        mockMvc.perform(
            multipart("/submit")
                .file(sequencesFile)
                .file(metadataFile)
                .param("username", username),
        )

    fun extractUnprocessedData(numberOfSequenceEntries: Int): ResultActions =
        mockMvc.perform(
            post("/extract-unprocessed-data")
                .param("numberOfSequenceEntries", numberOfSequenceEntries.toString()),
        )

    fun submitProcessedData(vararg submittedProcessedData: SubmittedProcessedData): ResultActions {
        val stringContent = submittedProcessedData.joinToString("\n") { objectMapper.writeValueAsString(it) }

        return submitProcessedDataRaw(stringContent)
    }

    fun submitProcessedDataRaw(submittedProcessedData: String): ResultActions =
        mockMvc.perform(
            post("/submit-processed-data")
                .contentType(MediaType.APPLICATION_NDJSON_VALUE)
                .content(submittedProcessedData),
        )

    fun getSequenceEntriesOfUser(userName: String): ResultActions =
        mockMvc.perform(
            get("/get-sequences-of-user")
                .param("username", userName),
        )

    fun getSequenceEntryThatNeedsReview(accession: Accession, version: Long, userName: String): ResultActions =
        mockMvc.perform(
            get("/get-data-to-review/$accession/$version")
                .param("username", userName),
        )

    fun getNumberOfSequenceEntriesThatNeedReview(userName: String, numberOfSequences: Int): ResultActions =
        mockMvc.perform(
            get("/get-data-to-review")
                .param("username", userName)
                .param("numberOfSequenceEntries", numberOfSequences.toString()),
        )

    fun submitReviewedSequenceEntry(userName: String, reviewedData: UnprocessedData): ResultActions {
        return mockMvc.perform(
            post("/submit-reviewed-sequence")
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(reviewedData)),
        )
    }

    fun approveProcessedSequenceEntries(
        listOfSequencesToApprove: List<AccessionVersion>,
        userName: String = USER_NAME,
    ): ResultActions =
        mockMvc.perform(
            post("/approve-processed-data")
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"accessionVersions":${objectMapper.writeValueAsString(listOfSequencesToApprove)}}"""),
        )

    fun revokeSequenceEntries(
        listOfSequenceEntriesToRevoke: List<Accession>,
        userName: String = USER_NAME,
    ): ResultActions =
        mockMvc.perform(
            post("/revoke")
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"accessions":$listOfSequenceEntriesToRevoke}"""),
        )

    fun confirmRevocation(
        listOfSequencesToConfirm: List<AccessionVersion>,
        userName: String = USER_NAME,
    ): ResultActions =
        mockMvc.perform(
            post("/confirm-revocation")
                .param("username", userName)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"accessionVersions":${objectMapper.writeValueAsString(listOfSequencesToConfirm)}}"""),
        )

    fun getReleasedData(): ResultActions =
        mockMvc.perform(
            get("/get-released-data"),
        )

    fun deleteSequenceEntries(
        listOfAccessionVersionsToDelete: List<AccessionVersion>,
        userName: String = USER_NAME,
    ): ResultActions =
        mockMvc.perform(
            delete("/delete-sequences")
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
    ): ResultActions =
        mockMvc.perform(
            multipart("/revise")
                .file(sequencesFile)
                .file(metadataFile)
                .param("username", username),
        )
}
