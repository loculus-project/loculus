package org.loculus.backend.utils

import org.loculus.backend.service.CODE_POINTS
import org.loculus.backend.service.files.FileId
import java.security.SecureRandom

private const val FILE_ID_PREFIX = "FILE_"
private const val FILE_ID_RANDOM_PART_LENGTH = 12

private val secureRandom = SecureRandom()

fun generateFileId(): FileId = buildString {
    append(FILE_ID_PREFIX)
    repeat(FILE_ID_RANDOM_PART_LENGTH) { append(CODE_POINTS[secureRandom.nextInt(CODE_POINTS.length)]) }
}
