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

const val MOCK_DATASET_ID = "mock-dataset-id"
const val MOCK_DATASET_VERSION = 1L
const val MOCK_DATASET_NAME = "mock-dataset-name"
const val MOCK_DATASET_DESCRIPTION = "mock-dataset-description"
const val MOCK_DATASET_RECORDS = "[]"
const val MOCK_AUTHOR_ID = "mock-author-id"
const val MOCK_AUTHOR_NAME = "mock-author-name"

class DatasetCitationsControllerClient(private val mockMvc: MockMvc) {

    fun createDataset(datasetName: String = MOCK_DATASET_NAME, jwt: String? = jwtForDefaultUser): ResultActions =
        mockMvc.perform(
            post("/create-dataset")
                .contentType(MediaType.APPLICATION_JSON_VALUE)
                .content("""{"datasetName":"$datasetName"}""")
                .withAuth(jwt),
        )

    fun getDataset(datasetId: String = MOCK_DATASET_ID, datasetVersion: Long? = MOCK_DATASET_VERSION): ResultActions =
        mockMvc.perform(
            get("/get-dataset")
                .param("datasetId", datasetId)
                .param("version", datasetVersion.toString()),
        )

    fun updateDataset(
        datasetId: String = MOCK_DATASET_ID,
        datasetName: String = MOCK_DATASET_NAME,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        put("/update-dataset")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content("""{"datasetId":"$datasetId", "datasetName":"$datasetName"}""")
            .withAuth(jwt),
    )

    fun getDatasetsOfUser(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/get-datasets-of-user")
            .withAuth(jwt),
    )

    fun getDatasetRecords(
        datasetId: String = MOCK_DATASET_ID,
        datasetVersion: Long? = MOCK_DATASET_VERSION,
    ): ResultActions = mockMvc.perform(
        get("/get-dataset-records")
            .param("datasetId", datasetId)
            .param("version", datasetVersion.toString()),
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

    fun updateAuthor(
        authorId: String = MOCK_AUTHOR_ID,
        authorName: String? = MOCK_AUTHOR_NAME,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        put("/update-author")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content("""{"authorId":"$authorId","authorName":"$authorName",}""")
            .withAuth(jwt),
    )
}
