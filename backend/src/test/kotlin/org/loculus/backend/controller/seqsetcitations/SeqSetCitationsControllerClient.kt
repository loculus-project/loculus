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
const val MOCK_USERNAME = "testuser"
const val MOCK_USER_EMAIL = "testuser@example.com"
const val MOCK_USER_FIRST_NAME = "Test"
const val MOCK_USER_LAST_NAME = "User"
const val MOCK_USER_UNIVERSITY = "Test University"

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
    ): ResultActions = mockMvc.perform(
        get("/get-dataset-cited-by-publication")
            .param("datasetId", datasetId)
            .param("version", datasetVersion.toString()),
    )

    fun getAuthor(username: String): ResultActions = mockMvc.perform(
        get("/get-author")
            .param("username", username),
    )

    fun validateDatasetRecords(datasetRecords: String, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            post("/validate-dataset-records")
                .contentType(MediaType.APPLICATION_JSON_VALUE)
                .content(datasetRecords)
                .withAuth(jwt),
        )
}
