package org.loculus.backend.service.files

interface S3Service {
    fun createUrlToUploadPrivateFile(fileId: FileId): String
    fun createUrlToReadPrivateFile(fileId: FileId, downloadFileName: String? = null): String
    fun getPublicUrl(fileId: FileId): String
    fun setFileToPublic(fileId: FileId)
}
