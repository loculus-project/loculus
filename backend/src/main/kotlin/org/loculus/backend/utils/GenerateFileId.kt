package org.loculus.backend.utils

import org.loculus.backend.service.files.FileId

const val FILE_ID_PREFIX = "FILE_"
const val FILE_ID_SEQUENCE_NAME = "file_id_sequence"
private const val FILE_ID_SERIAL_LENGTH = 6

fun generateFileId(sequenceNumber: Long): FileId {
    val serialFileIdPart = fileIdSerial(sequenceNumber)
    return FILE_ID_PREFIX + serialFileIdPart + generateCheckCharacter(serialFileIdPart)
}

/** The file ID without its check character. It sorts directly before the file ID itself. */
fun fileIdSerial(sequenceNumber: Long): String = base34Encode(sequenceNumber, FILE_ID_SERIAL_LENGTH)

fun validateFileId(fileId: FileId): Boolean =
    fileId.startsWith(FILE_ID_PREFIX) && validateCheckCharacter(fileId.removePrefix(FILE_ID_PREFIX))

/** Inverse of [generateFileId]; `null` if the string is not a valid file ID. */
fun fileIdToSequenceNumber(fileId: String): Long? = when {
    !validateFileId(fileId) -> null
    else -> base34Decode(fileId.removePrefix(FILE_ID_PREFIX).dropLast(1))
}
