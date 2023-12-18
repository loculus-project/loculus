package org.pathoplexus.backend.controller.submission

import com.fasterxml.jackson.databind.ObjectMapper
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.controller.DEFAULT_ORGANISM
import org.pathoplexus.backend.controller.addOrganismToPath
import org.pathoplexus.backend.controller.jwtForDefaultUser
import org.pathoplexus.backend.controller.jwtForGetReleasedData
import org.pathoplexus.backend.controller.jwtForProcessingPipeline
import org.pathoplexus.backend.controller.withAuth
import org.pathoplexus.backend.utils.Accession
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post

const val DEFAULT_USER_NAME = "testUser"

class SubmissionControllerClient(private val mockMvc: MockMvc, private val objectMapper: ObjectMapper) {
    fun submit(
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        multipart(addOrganismToPath("/submit", organism = organism))
            .file(sequencesFile)
            .file(metadataFile)
            .withAuth(jwt),
    )

    fun extractUnprocessedData(
        numberOfSequenceEntries: Int,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForProcessingPipeline,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/extract-unprocessed-data", organism = organism))
            .withAuth(jwt)
            .param("numberOfSequenceEntries", numberOfSequenceEntries.toString()),
    )

    fun submitProcessedData(
        vararg submittedProcessedData: SubmittedProcessedData,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForProcessingPipeline,
    ): ResultActions {
        val stringContent = submittedProcessedData.joinToString("\n") { objectMapper.writeValueAsString(it) }

        return submitProcessedDataRaw(stringContent, organism, jwt)
    }

    fun submitProcessedDataRaw(
        submittedProcessedData: String,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForProcessingPipeline,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/submit-processed-data", organism = organism))
            .contentType(MediaType.APPLICATION_NDJSON_VALUE)
            .withAuth(jwt)
            .content(submittedProcessedData),
    )

    fun getSequenceEntriesOfUser(
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get(addOrganismToPath("/get-sequences-of-user", organism = organism))
            .withAuth(jwt),
    )

    fun getSequenceEntryThatHasErrors(
        accession: Accession,
        version: Long,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get(addOrganismToPath("/get-data-to-edit/$accession/$version", organism = organism))
            .withAuth(jwt),
    )

    fun getNumberOfSequenceEntriesThatHaveErrors(
        numberOfSequenceEntries: Int,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get(addOrganismToPath("/get-data-to-edit", organism = organism))
            .withAuth(jwt)
            .param("numberOfSequenceEntries", numberOfSequenceEntries.toString()),
    )

    fun submitEditedSequenceEntryVersion(
        editedData: UnprocessedData,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions {
        return mockMvc.perform(
            post(addOrganismToPath("/submit-edited-data", organism = organism))
                .withAuth(jwt)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(editedData)),
        )
    }

    fun approveProcessedSequenceEntries(
        listOfSequencesToApprove: List<AccessionVersion>,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/approve-processed-data", organism = organism))
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"accessionVersions":${objectMapper.writeValueAsString(listOfSequencesToApprove)}}""")
            .withAuth(jwt),
    )

    fun revokeSequenceEntries(
        listOfSequenceEntriesToRevoke: List<Accession>,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/revoke", organism = organism))
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"accessions":$listOfSequenceEntriesToRevoke}""")
            .withAuth(jwt),
    )

    fun confirmRevocation(
        listOfSequencesToConfirm: List<AccessionVersion>,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/confirm-revocation", organism = organism))
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"accessionVersions":${objectMapper.writeValueAsString(listOfSequencesToConfirm)}}""")
            .withAuth(jwt),
    )

    fun getReleasedData(organism: String = DEFAULT_ORGANISM, jwt: String? = jwtForGetReleasedData): ResultActions =
        mockMvc.perform(
            get(addOrganismToPath("/get-released-data", organism = organism))
                .withAuth(jwt),
        )

    fun deleteSequenceEntries(
        listOfAccessionVersionsToDelete: List<AccessionVersion>,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        delete(addOrganismToPath("/delete-sequence-entry-versions", organism = organism))
            .withAuth(jwt)
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                """{"accessionVersions":${objectMapper.writeValueAsString(listOfAccessionVersionsToDelete)}}""",
            ),
    )

    fun reviseSequenceEntries(
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        multipart(addOrganismToPath("/revise", organism = organism))
            .file(sequencesFile)
            .file(metadataFile)
            .withAuth(jwt),
    )
}
