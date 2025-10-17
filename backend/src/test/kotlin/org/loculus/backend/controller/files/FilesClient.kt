package org.loculus.backend.controller.files

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.loculus.backend.api.FileCategory
import org.loculus.backend.api.FileIdAndEtags
import org.loculus.backend.api.FileIdAndMultipartWriteUrl
import org.loculus.backend.api.FileIdAndWriteUrl
import org.loculus.backend.controller.jacksonObjectMapper
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.withAuth
import org.loculus.backend.service.files.FileId
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import java.util.*

class FilesClient(private val mockMvc: MockMvc) {

    fun requestUploads(groupId: Int?, numberFiles: Int? = null, jwt: String = jwtForDefaultUser): ResultActions {
        val request = post("/files/request-upload")
            .withAuth(jwt)
        groupId?.let { request.param("groupId", it.toString()) }
        numberFiles?.let { request.param("numberFiles", it.toString()) }
        return mockMvc.perform(request)
    }

    fun requestMultipartUploads(
        groupId: Int? = null,
        numberFiles: Int? = null,
        numberParts: Int? = null,
        jwt: String = jwtForDefaultUser,
    ): ResultActions {
        val request = post("/files/request-multipart-upload")
            .withAuth(jwt)
        groupId?.let { request.param("groupId", it.toString()) }
        numberFiles?.let { request.param("numberFiles", it.toString()) }
        numberParts?.let { request.param("numberParts", it.toString()) }
        return mockMvc.perform(request)
    }

    fun completeMultipartUploads(
        fileIdAndEtags: List<FileIdAndEtags>? = null,
        jwt: String = jwtForDefaultUser,
    ): ResultActions {
        val request = post("/files/complete-multipart-upload")
            .withAuth(jwt)
            .contentType(MediaType.APPLICATION_JSON)
        fileIdAndEtags?.let { request.content(jacksonObjectMapper().writeValueAsString(it)) }
        return mockMvc.perform(request)
    }

    fun getFile(
        accession: Accession,
        version: Version,
        fileCategory: FileCategory,
        fileName: String,
        jwt: String? = null,
    ): ResultActions {
        val request = get(
            "/files/get/{accession}/{version}/{category}/{filename}",
            accession,
            version,
            fileCategory,
            fileName,
        )
            .withAuth(jwt)
        return mockMvc.perform(request)
    }

    fun headFile(
        accession: Accession,
        version: Version,
        fileCategory: FileCategory,
        fileName: String,
        jwt: String? = null,
    ): ResultActions {
        val request = head(
            "/files/get/{accession}/{version}/{category}/{filename}",
            accession,
            version,
            fileCategory,
            fileName,
        ).withAuth(jwt)
        return mockMvc.perform(request)
    }
}

fun ResultActions.andGetFileIds(): List<FileId> = andReturn()
    .response
    .contentAsString
    .let {
        val responseJson = jacksonObjectMapper().readTree(it)
        responseJson.map { UUID.fromString(it.get("fileId").textValue()) }
    }

fun ResultActions.andGetFileIdsAndUrls(): List<FileIdAndWriteUrl> = andReturn()
    .response
    .contentAsString
    .let {
        val responseJson = jacksonObjectMapper().readTree(it)
        responseJson.map { FileIdAndWriteUrl(UUID.fromString(it.get("fileId").textValue()), it.get("url").textValue()) }
    }

fun ResultActions.andGetFileIdsAndMultipartUrls(): List<FileIdAndMultipartWriteUrl> = andReturn()
    .response
    .contentAsString
    .let { body ->
        val root = jacksonObjectMapper().readTree(body)
        root.map { node ->
            val fileId = UUID.fromString(node.get("fileId").textValue())
            val urls = node.get("urls").map { it.textValue() }
            FileIdAndMultipartWriteUrl(fileId, urls)
        }
    }
