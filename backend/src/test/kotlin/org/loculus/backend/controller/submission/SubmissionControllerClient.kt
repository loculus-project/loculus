package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.ApproveDataScope
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DeleteSequenceScope
import org.loculus.backend.api.EditedSequenceEntryData
import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdFilesMap
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.controller.DEFAULT_EXTERNAL_METADATA_UPDATER
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_PIPELINE_VERSION
import org.loculus.backend.controller.addOrganismToPath
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForExternalMetadataUpdatePipeline
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

class SubmissionControllerClient(private val mockMvc: MockMvc, private val objectMapper: ObjectMapper) {
    fun submit(
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile? = null,
        organism: String = DEFAULT_ORGANISM,
        groupId: Int,
        dataUseTerm: DataUseTerms = DataUseTerms.Open,
        jwt: String? = jwtForDefaultUser,
        fileMapping: SubmissionIdFilesMap? = null,
    ): ResultActions = mockMvc.perform(
        multipart(addOrganismToPath("/submit", organism = organism))
            .apply {
                sequencesFile?.let { file(sequencesFile) }
            }
            .file(metadataFile)
            .apply {
                fileMapping?.let {
                    file(
                        MockMultipartFile(
                            "fileMapping",
                            "originalfile.txt",
                            "application/json",
                            objectMapper.writeValueAsBytes(fileMapping),
                        ),
                    )
                }
            }
            .param("groupId", groupId.toString())
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

    fun submitWithoutDataUseTerms(
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile? = null,
        organism: String = DEFAULT_ORGANISM,
        groupId: Int,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        multipart(addOrganismToPath("/submit", organism = organism))
            .apply {
                sequencesFile?.let { file(sequencesFile) }
            }
            .file(metadataFile)
            .param("groupId", groupId.toString())
            .withAuth(jwt),
    )

    fun extractUnprocessedData(
        numberOfSequenceEntries: Int,
        organism: String = DEFAULT_ORGANISM,
        pipelineVersion: Long = DEFAULT_PIPELINE_VERSION,
        ifNoneMatch: String? = null,
        jwt: String? = jwtForProcessingPipeline,
    ): ResultActions {
        val requestBuilder = post(addOrganismToPath("/extract-unprocessed-data", organism = organism))
            .withAuth(jwt)
            .param("numberOfSequenceEntries", numberOfSequenceEntries.toString())
            .param("pipelineVersion", pipelineVersion.toString())

        if (ifNoneMatch != null) {
            requestBuilder.header("If-None-Match", ifNoneMatch)
        }

        return mockMvc.perform(requestBuilder)
    }

    fun submitProcessedData(
        vararg submittedProcessedData: SubmittedProcessedData,
        organism: String = DEFAULT_ORGANISM,
        pipelineVersion: Long = DEFAULT_PIPELINE_VERSION,
        jwt: String? = jwtForProcessingPipeline,
    ): ResultActions {
        val stringContent = submittedProcessedData.joinToString("\n") { objectMapper.writeValueAsString(it) }

        return submitProcessedDataRaw(stringContent, organism, pipelineVersion, jwt)
    }

    fun submitExternalMetadata(
        vararg submittedExternalMetadata: ExternalSubmittedData,
        organism: String = DEFAULT_ORGANISM,
        externalMetadataUpdater: String = DEFAULT_EXTERNAL_METADATA_UPDATER,
        jwt: String? = jwtForExternalMetadataUpdatePipeline,
    ): ResultActions {
        val stringContent =
            submittedExternalMetadata.joinToString("\n") { objectMapper.writeValueAsString(it) }

        return submitExternalMetadataRaw(stringContent, organism, externalMetadataUpdater, jwt)
    }

    fun submitProcessedDataRaw(
        submittedProcessedData: String,
        organism: String = DEFAULT_ORGANISM,
        pipelineVersion: Long = DEFAULT_PIPELINE_VERSION,
        jwt: String? = jwtForProcessingPipeline,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/submit-processed-data", organism = organism))
            .param("pipelineVersion", pipelineVersion.toString())
            .contentType(MediaType.APPLICATION_NDJSON_VALUE)
            .withAuth(jwt)
            .content(submittedProcessedData),
    )

    fun submitExternalMetadataRaw(
        submittedExternalMetadata: String,
        organism: String = DEFAULT_ORGANISM,
        externalMetadataUpdater: String = DEFAULT_EXTERNAL_METADATA_UPDATER,
        jwt: String? = jwtForExternalMetadataUpdatePipeline,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/submit-external-metadata", organism = organism))
            .param("externalMetadataUpdater", externalMetadataUpdater)
            .contentType(MediaType.APPLICATION_NDJSON_VALUE)
            .withAuth(jwt)
            .content(submittedExternalMetadata),
    )

    fun getSequenceEntries(
        organism: String = DEFAULT_ORGANISM,
        groupIdsFilter: List<Int>? = null,
        statusesFilter: List<Status>? = null,
        processingResultFilter: List<ProcessingResult>? = null,
        jwt: String? = jwtForDefaultUser,
        page: Int? = null,
        size: Int? = null,
    ): ResultActions = mockMvc.perform(
        get(addOrganismToPath("/get-sequences", organism = organism))
            .withAuth(jwt)
            .param("groupIdsFilter", groupIdsFilter?.joinToString(",") { it.toString() })
            .param("statusesFilter", statusesFilter?.joinToString(",") { it.name })
            .param("processingResultFilter", processingResultFilter?.joinToString(",") { it.name })
            .param("page", page?.toString())
            .param("size", size?.toString()),
    )

    fun getSequenceEntryToEdit(
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

    fun submitEditedSequenceEntryVersion(
        editedData: EditedSequenceEntryData,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/submit-edited-data", organism = organism))
            .withAuth(jwt)
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(editedData)),
    )

    fun approveProcessedSequenceEntries(
        scope: ApproveDataScope,
        accessionVersionsFilter: List<AccessionVersionInterface>? = null,
        submitterNamesFilter: List<String>? = null,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/approve-processed-data", organism = organism))
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                """{
                    "accessionVersionsFilter": ${serialize(accessionVersionsFilter)},
                    ${
                    submitterNamesFilter?.let {
                        """"submitterNamesFilter": [${it.joinToString(",") { name -> "\"$name\"" }}],"""
                    } ?: ""
                }
                    "scope": "$scope"
                }""",
            )
            .withAuth(jwt),
    )

    fun revokeSequenceEntries(
        listOfSequenceEntriesToRevoke: List<Accession>,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
        versionComment: String? = null,
    ): ResultActions = mockMvc.perform(
        post(addOrganismToPath("/revoke", organism = organism))
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                """{"accessions":${
                    objectMapper.writeValueAsString(
                        listOfSequenceEntriesToRevoke,
                    )
                }, "versionComment":${objectMapper.writeValueAsString(versionComment)}}""",
            )
            .withAuth(jwt),
    )

    fun getReleasedData(
        organism: String = DEFAULT_ORGANISM,
        compression: String? = null,
        ifNoneMatch: String? = null,
        releasedSince: String? = null,
    ): ResultActions = mockMvc.perform(
        get(addOrganismToPath("/get-released-data", organism = organism))
            .also {
                when (compression) {
                    null -> it
                    else -> it.param("compression", compression)
                }
            }
            .also {
                when (ifNoneMatch) {
                    null -> it
                    else -> it.header("If-None-Match", ifNoneMatch)
                }
            }
            .also {
                when (releasedSince) {
                    null -> it
                    else -> it.param("releasedSince", releasedSince)
                }
            },
    )

    fun deleteSequenceEntries(
        scope: DeleteSequenceScope,
        accessionVersionsFilter: List<AccessionVersionInterface>? = null,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        delete(addOrganismToPath("/delete-sequence-entry-versions", organism = organism))
            .withAuth(jwt)
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                """
                    {
                        "accessionVersionsFilter": ${serialize(accessionVersionsFilter)},
                        "scope": "$scope"
                    }
                """.trimMargin(),
            ),
    )

    fun reviseSequenceEntries(
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile?,
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
        fileMapping: SubmissionIdFilesMap? = null,
    ): ResultActions = mockMvc.perform(
        multipart(addOrganismToPath("/revise", organism = organism))
            .apply {
                sequencesFile?.let { file(sequencesFile) }
            }
            .file(metadataFile)
            .apply {
                fileMapping?.let {
                    file(
                        MockMultipartFile(
                            "fileMapping",
                            "originalfile.txt",
                            "application/json",
                            objectMapper.writeValueAsBytes(fileMapping),
                        ),
                    )
                }
            }
            .withAuth(jwt),
    )

    fun getOriginalMetadata(
        organism: String = DEFAULT_ORGANISM,
        jwt: String? = jwtForDefaultUser,
        groupIdsFilter: List<Int>? = null,
        statusesFilter: List<Status>? = null,
        fields: List<String>? = null,
        compression: String? = null,
    ): ResultActions = mockMvc.perform(
        get(addOrganismToPath("/get-original-metadata", organism = organism))
            .withAuth(jwt)
            .also {
                when (compression) {
                    null -> it
                    else -> it.param("compression", compression)
                }
            }
            .param("groupIdsFilter", groupIdsFilter?.joinToString(",") { it.toString() })
            .param("statusesFilter", statusesFilter?.joinToString(",") { it.name })
            .param("fields", fields?.joinToString(",")),
    )

    private fun serialize(listOfSequencesToApprove: List<AccessionVersionInterface>? = null): String =
        if (listOfSequencesToApprove != null) {
            objectMapper.writeValueAsString(
                listOfSequencesToApprove.map { AccessionVersion(it.accession, it.version) },
            )
        } else {
            "null"
        }
}
