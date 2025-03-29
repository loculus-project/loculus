package org.loculus.backend.api

import org.loculus.backend.service.files.FileId

data class FileIdAndUrl(val fileId: FileId, val url: String)
