package org.loculus.backend.utils

import org.loculus.backend.service.files.FileId

private const val FILE_ID_PREFIX = "FILE_"
private const val FILE_ID_SERIAL_LENGTH = 6

fun generateFileIds(count: Int): List<FileId> = getNextSequenceNumbers("file_id_sequence", count)
    .map { generateFileId(it) }

fun generateFileId(sequenceNumber: Long): FileId {
    val serialFileIdPart = base34Encode(sequenceNumber, FILE_ID_SERIAL_LENGTH)
    return FILE_ID_PREFIX + serialFileIdPart + generateCheckCharacter(serialFileIdPart)
}

fun validateFileId(fileId: FileId): Boolean =
    fileId.startsWith(FILE_ID_PREFIX) && validateCheckCharacter(fileId.removePrefix(FILE_ID_PREFIX))
