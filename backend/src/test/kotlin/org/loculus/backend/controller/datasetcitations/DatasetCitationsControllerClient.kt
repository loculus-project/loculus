package org.loculus.backend.controller.datasetcitations

import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.withAuth
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put

const val MOCK_DATASET_ID = "e302e770-e198-4a8f-9145-b536e3590656"
const val MOCK_DATASET_VERSION = 1L
const val MOCK_DATASET_NAME = "mock-dataset-name"
const val MOCK_DATASET_DESCRIPTION = "mock-dataset-description"
const val MOCK_DATASET_RECORDS = "[{ \"accession\": \"mock-sequence-accession.1\", \"type\": \"loculus\" }]"
const val MOCK_AUTHOR_ID = "mock-author-id"
const val MOCK_AUTHOR_NAME = "testuser"
const val MOCK_AUTHOR_AFFILIATION = "mock-author-affiliation"
const val MOCK_AUTHOR_EMAIL = "mock-author@email.com"

class DatasetCitationsControllerClient(
    private val mockMvc: MockMvc,
) {

    fun createDataset(
        datasetName: String = MOCK_DATASET_NAME,
        datasetDescription: String? = MOCK_DATASET_DESCRIPTION,
        datasetRecords: String? = MOCK_DATASET_RECORDS,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post("/create-dataset")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(
                """{
                    "name": "$datasetName",
                    "description": "$datasetDescription",
                    "records": $datasetRecords
                }""",
            )
            .withAuth(jwt),
    )

    fun getDataset(
        datasetId: String = MOCK_DATASET_ID,
        datasetVersion: Long? = MOCK_DATASET_VERSION,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get("/get-dataset")
            .param("datasetId", datasetId)
            .param("version", datasetVersion.toString())
            .withAuth(jwt),
    )

    fun updateDataset(
        datasetId: String = MOCK_DATASET_ID,
        datasetName: String? = MOCK_DATASET_NAME,
        datasetDescription: String? = MOCK_DATASET_DESCRIPTION,
        datasetRecords: String? = MOCK_DATASET_RECORDS,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        put("/update-dataset")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(
                """{
                    "datasetId":"$datasetId",
                    "name":"$datasetName",
                    "description": "$datasetDescription",
                    "records": $datasetRecords
                }""",
            )
            .withAuth(jwt),
    )

    fun getDatasetsOfUser(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/get-datasets-of-user")
            .withAuth(jwt),
    )

    fun getDatasetRecords(
        datasetId: String = MOCK_DATASET_ID,
        datasetVersion: Long? = MOCK_DATASET_VERSION,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get("/get-dataset-records")
            .param("datasetId", datasetId)
            .param("version", datasetVersion.toString())
            .withAuth(jwt),
    )

    fun deleteDataset(
        datasetId: String = MOCK_DATASET_ID,
        datasetVersion: Long? = MOCK_DATASET_VERSION,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        delete("/delete-dataset")
            .param("datasetId", datasetId)
            .param("version", datasetVersion.toString())
            .withAuth(jwt),
    )

    fun createDatasetDOI(
        datasetId: String = MOCK_DATASET_ID,
        datasetVersion: Long? = MOCK_DATASET_VERSION,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post("/create-dataset-doi")
            .param("datasetId", datasetId)
            .param("version", datasetVersion.toString())
            .withAuth(jwt),
    )

    fun getUserCitedByDataset(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/get-user-cited-by-dataset")
            .withAuth(jwt),
    )

    fun getDatasetCitedByPublication(
        datasetId: String = MOCK_DATASET_ID,
        datasetVersion: Long = MOCK_DATASET_VERSION,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get("/get-dataset-cited-by-publication")
            .param("datasetId", datasetId)
            .param("version", datasetVersion.toString())
            .withAuth(jwt),
    )

    fun getAuthor(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/get-author")
            .withAuth(jwt),
    )

    fun createAuthor(
        authorName: String? = MOCK_AUTHOR_NAME,
        authorAffiliation: String? = MOCK_AUTHOR_AFFILIATION,
        authorEmail: String? = MOCK_AUTHOR_EMAIL,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post("/create-author")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(
                """{
                    "name":"$authorName",
                    "affiliation":"$authorAffiliation",
                    "email":"$authorEmail"
                }""",
            )
            .withAuth(jwt),
    )

    fun updateAuthor(
        authorId: String = MOCK_AUTHOR_ID,
        authorName: String? = MOCK_AUTHOR_NAME,
        authorAffiliation: String? = MOCK_AUTHOR_AFFILIATION,
        authorEmail: String? = MOCK_AUTHOR_EMAIL,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        put("/update-author")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .param("authorId", authorId)
            .content(
                """{
                    "name":"$authorName",
                    "affiliation":"$authorAffiliation",
                    "email":"$authorEmail"
                }""",
            )
            .withAuth(jwt),
    )

    fun deleteAuthor(authorId: String = MOCK_AUTHOR_ID, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            delete("/delete-author")
                .param("authorId", authorId)
                .withAuth(jwt),
        )
}
