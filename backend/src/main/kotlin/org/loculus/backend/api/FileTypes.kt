/*
 * Includes API data classes that are used for the file sharing feature.
 */
package org.loculus.backend.api

import com.fasterxml.jackson.annotation.JsonProperty
import io.swagger.v3.oas.annotations.media.Schema
import kotlinx.datetime.LocalDateTime
import org.loculus.backend.service.files.FileId

data class FileIdAndWriteUrl(
    @Schema(
        description = "The id of the file.",
        example = "8D8AC610-566D-4EF0-9C22-186B2A5ED793",
    ) val fileId: FileId,
    @Schema(
        description = "A presigned URL, allowing users to PUT an object.",
        example = "https://dummyendpoint.com/dummybucket/files/2ea137d0-8773-4e0a-a9aa-5591de12ff23?" +
            "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=dummyaccesskey%2F20250330%2F" +
            "dummyregion%2Fs3%2Faws4_request&X-Amz-Date=20250330T184050Z&X-Amz-Expires=1800" +
            "&X-Amz-SignedHeaders=host" +
            "&X-Amz-Signature=9717e8d8c8242d0d266f816c665d78b1d842de5286fb59e37329f090e9bb0b9e",
    )
    @JsonProperty("url")
    val presignedWriteUrl: String,
)

data class FileIdAndMultipartWriteUrl(
    @Schema(
        description = "The id of the file.",
        example = "8D8AC610-566D-4EF0-9C22-186B2A5ED793",
    ) val fileId: FileId,
    @Schema(
        description = "A list of presigned URL, allowing users to PUT parts of an object.",
    )
    @JsonProperty("urls")
    val presignedWriteUrls: List<String>,
)

data class FileIdAndName(val fileId: FileId, val name: String)

data class FileIdAndNameAndReadUrl(val fileId: FileId, val name: String, @JsonProperty("url") val readUrl: String)

/**
 * Strip the URL from the object.
 */
fun FileIdAndNameAndReadUrl.toFileIdAndName(): FileIdAndName = FileIdAndName(fileId, name)

data class FileIdAndEtags(val fileId: FileId, val etags: List<String>)

data class FileIdAndMaybeReleasedAt(val fileId: FileId, val releasedAt: LocalDateTime?)
