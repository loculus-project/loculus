package org.loculus.backend.api

import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.service.files.FileId

data class FileIdAndUrl(
    @Schema(description = "The id of the file.", example = "8D8AC610-566D-4EF0-9C22-186B2A5ED793") val fileId: FileId,
    @Schema(
        description = "A presigned URL",
        example = "https://dummyendpoint.com/dummybucket/files/1/2ea137d0-8773-4e0a-a9aa-5591de12ff23?" +
            "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=dummyaccesskey%2F20250330%2F" +
            "dummyregion%2Fs3%2Faws4_request&X-Amz-Date=20250330T184050Z&X-Amz-Expires=1800" +
            "&X-Amz-SignedHeaders=host" +
            "&X-Amz-Signature=9717e8d8c8242d0d266f816c665d78b1d842de5286fb59e37329f090e9bb0b9e",
    ) val url: String,
)

data class FileIdAndName(val fileId: FileId, val name: String)

@Seriali
data class FileIdAndNameAndUrl(val fileId: FileId, val name: String, val url: String)
