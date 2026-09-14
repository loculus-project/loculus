package org.loculus.backend.utils

import org.loculus.backend.service.files.FileId

private const val FILE_ID_PREFIX = "FILE_"
private const val FILE_ID_MIN_SERIAL_LENGTH = 4

fun generateFileIds(count: Int): List<FileId> = getNextSequenceNumbers("file_id_sequence", count)
    .map { FILE_ID_PREFIX + base34Encode(it, FILE_ID_MIN_SERIAL_LENGTH) }
