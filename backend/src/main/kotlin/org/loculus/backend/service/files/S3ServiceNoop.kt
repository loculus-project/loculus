package org.loculus.backend.service.files

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service

@Service
@ConditionalOnProperty(name = ["loculus.s3.enabled"], havingValue = "false", matchIfMissing = true)
class S3ServiceNoop : S3Service {
    private fun error(): Nothing = throw IllegalStateException("S3 is disabled")

    override fun createUrlToUploadPrivateFile(fileId: FileId): String = error()
    override fun createUrlToReadPrivateFile(fileId: FileId, downloadFileName: String?): String = error()
    override fun getPublicUrl(fileId: FileId): String = error()
    override fun setFileToPublic(fileId: FileId): Unit = error()
}
