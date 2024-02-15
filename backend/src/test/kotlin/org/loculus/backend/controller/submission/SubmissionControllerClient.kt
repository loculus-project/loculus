package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.ApproveDataScope
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DeleteSequenceScope
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.api.WarningsFilter
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.addOrganismToPath
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForGetReleasedData
import org.loculus.backend.controller.jwtForProcessingPipeline
import org.loculus.backend.controller.withAuth
import org.loculus.backend.utils.Accession
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post

const val DEFAULT_USER_NAME = "testuser"
class SubmissionControllerClient(private val mockMvc: MockMvc, private val objectMapper: ObjectMapper) {
    fun submit(
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile,
        organism: String = DEFAULT_ORGANISM,
        groupName: String = DEFAULT_GROUP_NAME,
        dataUseTerm: DataUseTerms = DataUseTerms.Open,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        multipart(addOrganismToPath("/submit", organism = organism))
            .file(sequencesFile)
            .file(metadataFile)
            .param("groupName", groupName)
            .param("dataUseTermsType", dataUseTerm.type.name)
            .param(
                "restrictedUntil",
                when (dataUseTerm) {
                    is DataUseTerms.Restricted -> dataUseTerm.restrictedUntil.toString()
                    else -> null
                },
            )
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

    fun getSequenceEntries(
        organism: String = DEFAULT_ORGANISM,
        groupsFilter: List<String>? = null,
        statusesFilter: List<Status>? = null,
        warningsFilter: WarningsFilter? = null,
        jwt: String? = jwtForDefaultUser,
        page: Int? = null,
        size: Int? = null,
    ): ResultActions {
        return mockMvc.perform(
            get(addOrganismToPath("/get-sequences", organism = organism))
                .withAuth(jwt)
                .param("groupsFilter", groupsFilter?.joinToString { it })
                .param("statusesFilter", statusesFilter?.joinToString { it.name })
                .param("warningsFilter", warningsFilter?.name)
                .param("page", page?.toString())
                .param("size", size?.toString()),
        )
    }

    fun getSequenceEntryThatHasErrors(
        accession: Accession,
        version: Long,
        organism: String = DEFAULT_ORGANISM,
        groupName: String = DEFAULT_GROUP_NAME,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get(addOrganismToPath("/get-data-to-edit/$accession/$version", organism = organism))
            .withAuth(jwt)
            .param("groupName", groupName),
    )

    fun getNumberOfSequenceEntriesThatHaveErrors(
        numberOfSequenceEntries: Int,
        organism: String = DEFAULT_ORGANISM,
        groupName: String = DEFAULT_GROUP_NAME,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get(addOrganismToPath("/get-data-to-edit", organism = organism))
            .withAuth(jwt)
            .param("groupName", groupName)
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
        listOfSequencesToApprove: List<AccessionVersion>? = null,
        organism: String = DEFAULT_ORGANISM,
        scope: ApproveDataScope = ApproveDataScope.ALL,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/approve-processed-data", organism = organism))
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                """{"accessionVersionsFilter": ${createAccessionVersionsFilterBodyString(listOfSequencesToApprove)},
                    "scope": "$scope"
                }""",
            )
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
        listOfAccessionVersionsToDelete: List<AccessionVersion>? = null,
        scope: DeleteSequenceScope = DeleteSequenceScope.ALL,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        delete(addOrganismToPath("/delete-sequence-entry-versions", organism = organism))
            .withAuth(jwt)
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                """{"accessionVersionsFilter":${createAccessionVersionsFilterBodyString(
                    listOfAccessionVersionsToDelete,
                )},
                    "scope": "$scope"}
                """.trimMargin(),
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

    private fun createAccessionVersionsFilterBodyString(
        listOfSequencesToApprove: List<AccessionVersion>? = null,
    ): String {
        return if (listOfSequencesToApprove != null) {
            objectMapper.writeValueAsString(
                listOfSequencesToApprove,
            )
        } else {
            "null"
        }
    }
}
