package org.loculus.backend.controller.seqsetcitations

import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.withAuth
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put

const val MOCK_SEQSET_ID = "e302e770-e198-4a8f-9145-b536e3590656"
const val MOCK_SEQSET_VERSION = 1L
const val MOCK_SEQSET_NAME = "mock-seqset-name"
const val MOCK_SEQSET_DESCRIPTION = "mock-seqset-description"
const val MOCK_SEQSET_RECORDS = "[{ \"accession\": \"mock-sequence-accession.1\", \"type\": \"loculus\" }]"
const val MOCK_USERNAME = "testuser"
const val MOCK_USER_EMAIL = "testuser@example.com"
const val MOCK_USER_FIRST_NAME = "Test"
const val MOCK_USER_LAST_NAME = "User"
const val MOCK_USER_UNIVERSITY = "Test University"

class SeqSetCitationsControllerClient(private val mockMvc: MockMvc) {

    fun createSeqSet(
        seqSetName: String = MOCK_SEQSET_NAME,
        seqSetDescription: String? = MOCK_SEQSET_DESCRIPTION,
        seqSetRecords: String? = MOCK_SEQSET_RECORDS,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post("/create-seqset")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(
                """{
                    "name": "$seqSetName",
                    "description": "$seqSetDescription",
                    "records": $seqSetRecords
                }""",
            )
            .withAuth(jwt),
    )

    fun getSeqSet(
        seqSetId: String = MOCK_SEQSET_ID,
        seqSetVersion: Long? = MOCK_SEQSET_VERSION,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get("/get-seqset")
            .param("seqSetId", seqSetId)
            .param("version", seqSetVersion.toString())
            .withAuth(jwt),
    )

    fun updateSeqSet(
        seqSetId: String = MOCK_SEQSET_ID,
        seqSetName: String? = MOCK_SEQSET_NAME,
        seqSetDescription: String? = MOCK_SEQSET_DESCRIPTION,
        seqSetRecords: String? = MOCK_SEQSET_RECORDS,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        put("/update-seqset")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(
                """{
                    "seqSetId":"$seqSetId",
                    "name":"$seqSetName",
                    "description": "$seqSetDescription",
                    "records": $seqSetRecords
                }""",
            )
            .withAuth(jwt),
    )

    fun getSeqSetsOfUser(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/get-seqsets-of-user")
            .withAuth(jwt),
    )

    fun getSeqSetRecords(
        seqSetId: String = MOCK_SEQSET_ID,
        seqSetVersion: Long? = MOCK_SEQSET_VERSION,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        get("/get-seqset-records")
            .param("seqSetId", seqSetId)
            .param("version", seqSetVersion.toString())
            .withAuth(jwt),
    )

    fun deleteSeqSet(
        seqSetId: String = MOCK_SEQSET_ID,
        seqSetVersion: Long? = MOCK_SEQSET_VERSION,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        delete("/delete-seqset")
            .param("seqSetId", seqSetId)
            .param("version", seqSetVersion.toString())
            .withAuth(jwt),
    )

    fun createSeqSetDOI(
        seqSetId: String = MOCK_SEQSET_ID,
        seqSetVersion: Long? = MOCK_SEQSET_VERSION,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        post("/create-seqset-doi")
            .param("seqSetId", seqSetId)
            .param("version", seqSetVersion.toString())
            .withAuth(jwt),
    )

    fun getUserCitedBySeqSet(jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        get("/get-user-cited-by-seqset")
            .withAuth(jwt),
    )

    fun getSeqSetCitedByPublication(
        seqSetId: String = MOCK_SEQSET_ID,
        seqSetVersion: Long = MOCK_SEQSET_VERSION,
    ): ResultActions = mockMvc.perform(
        get("/get-seqset-cited-by-publication")
            .param("seqSetId", seqSetId)
            .param("version", seqSetVersion.toString()),
    )

    fun getAuthor(username: String): ResultActions = mockMvc.perform(
        get("/get-author")
            .param("username", username),
    )

    fun validateSeqSetRecords(seqSetRecords: String, jwt: String? = jwtForDefaultUser): ResultActions = mockMvc.perform(
        post("/validate-seqset-records")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(seqSetRecords)
            .withAuth(jwt),
    )
}
