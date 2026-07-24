package org.loculus.backend.utils

import org.apache.commons.csv.CSVException
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.apache.commons.csv.CSVRecord
import org.loculus.backend.api.FileCategoryFilesMap
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.model.ACCESSION_HEADER
import org.loculus.backend.model.FASTA_IDS_HEADER
import org.loculus.backend.model.FASTA_IDS_SEPARATOR
import org.loculus.backend.model.FILES_HEADER_PREFIX
import org.loculus.backend.model.FILES_SEPARATOR
import org.loculus.backend.model.FastaId
import org.loculus.backend.model.METADATA_ID_HEADER
import org.loculus.backend.model.METADATA_ID_HEADER_ALTERNATE_FOR_BACKCOMPAT
import org.loculus.backend.model.SubmissionId
import java.io.InputStream
import java.io.InputStreamReader
import java.util.UUID

data class MetadataEntry(
    val submissionId: SubmissionId,
    val metadata: Map<String, String>,
    val fastaIds: Set<FastaId>? = null,
    val files: FileCategoryFilesMap? = null,
)

private fun invalidTsvFormatException(originalException: Exception) = UnprocessableEntityException(
    "The metadata file is not a valid TSV file. Common causes include: fields not separated by tabs, " +
        "improperly formatted quoted fields, inconsistent number of fields per row, or empty lines. " +
        "Error: ${originalException.message}",
)

fun findAndValidateSubmissionIdHeader(headerNames: List<String>): String {
    val submissionIdHeaders = listOf(
        METADATA_ID_HEADER,
        METADATA_ID_HEADER_ALTERNATE_FOR_BACKCOMPAT,
    ).filter { headerNames.contains(it) }

    when {
        submissionIdHeaders.isEmpty() -> throw UnprocessableEntityException(
            "The metadata file does not contain either header '$METADATA_ID_HEADER' or '$METADATA_ID_HEADER_ALTERNATE_FOR_BACKCOMPAT'",
        )

        submissionIdHeaders.size > 1 -> throw UnprocessableEntityException(
            "The metadata file contains both '$METADATA_ID_HEADER' and '$METADATA_ID_HEADER_ALTERNATE_FOR_BACKCOMPAT'. Only one is allowed.",
        )
    }
    return submissionIdHeaders.first()
}

fun extractAndValidateFastaIds(record: CSVRecord, submissionId: String, recordNumber: Int): Set<FastaId> {
    val headerNames = record.parser.headerNames
    return when (headerNames.contains(FASTA_IDS_HEADER)) {
        true -> {
            val fastaIdValues = record[FASTA_IDS_HEADER]
            if (fastaIdValues.isNullOrEmpty()) {
                throw UnprocessableEntityException(
                    "In metadata file: record #$recordNumber: column `$FASTA_IDS_HEADER` is empty. This is invalid. Full record: $record",
                )
            }

            val fastaIds = fastaIdValues.split(Regex(FASTA_IDS_SEPARATOR))
                .map { it.trim() }
                .filter { it.isNotEmpty() }

            val duplicateFastaIds = fastaIds.groupingBy { it }.eachCount().filter { it.value > 1 }.keys
            if (duplicateFastaIds.isNotEmpty()) {
                throw UnprocessableEntityException(
                    "In metadata file: record #$recordNumber with id '$submissionId': " +
                        "found duplicate fasta ids in column '$FASTA_IDS_HEADER': " +
                        duplicateFastaIds.joinToString(", "),
                )
            }

            fastaIds.toSet()
        }

        false -> {
            setOf(submissionId)
        }
    }
}

/**
 * Parses the `files.<category>` columns of a record into a [FileCategoryFilesMap].
 * Each cell is a space-separated list of `fileName:fileId` pairs, e.g. `reads_1.fq:<uuid> reads_2.fq:<uuid>`.
 * Returns `null` if the metadata file has no `files.*` columns at all. Categories with a blank cell are omitted.
 */
fun extractAndValidateFiles(record: CSVRecord, submissionId: String, recordNumber: Int): FileCategoryFilesMap? {
    val fileHeaders = record.parser.headerNames.filter { it.startsWith(FILES_HEADER_PREFIX) }
    if (fileHeaders.isEmpty()) {
        return null
    }

    return fileHeaders.mapNotNull { header ->
        val cellValue = record[header]
        if (cellValue.isNullOrEmpty()) {
            return@mapNotNull null
        }

        val category = header.removePrefix(FILES_HEADER_PREFIX)
        val files = cellValue.split(FILES_SEPARATOR)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .map { token -> extractAndValidateFileIdAndName(token, header, submissionId, recordNumber) }

        val duplicateNames = files.groupingBy { it.name }.eachCount().filter { it.value > 1 }.keys
        if (duplicateNames.isNotEmpty()) {
            throw UnprocessableEntityException(
                "In metadata file: record #$recordNumber with id '$submissionId': " +
                    "found duplicate file names in column '$header': " + duplicateNames.joinToString(", "),
            )
        }

        category to files
    }.toMap().ifEmpty { null }
}

private fun extractAndValidateFileIdAndName(
    token: String,
    header: String,
    submissionId: String,
    recordNumber: Int,
): FileIdAndName {
    // We currently still support ':' characters in file names, so take the last occurence.
    // TODO: Update when file character list is restricted
    val separatorIndex = token.lastIndexOf(':')
    if (separatorIndex < 0) {
        throw UnprocessableEntityException(
            "In metadata file: record #$recordNumber with id '$submissionId': " +
                "file entry '$token' in column '$header' is missing a file ID. Expected format 'fileName:fileId'.",
        )
    }
    val name = token.substring(0, separatorIndex)
    val fileIdString = token.substring(separatorIndex + 1)
    if (name.isEmpty()) {
        throw UnprocessableEntityException(
            "In metadata file: record #$recordNumber with id '$submissionId': " +
                "file entry '$token' in column '$header' is missing a file name. Expected format 'fileName:fileId'.",
        )
    }

    // TODO: Update when moving away from UUIDs to more user-friendly file IDs
    val fileId = try {
        UUID.fromString(fileIdString)
    } catch (e: IllegalArgumentException) {
        throw UnprocessableEntityException(
            "In metadata file: record #$recordNumber with id '$submissionId': " +
                "file entry '$token' in column '$header' has an invalid file ID '$fileIdString'. " +
                "Expected a UUID.",
        )
    }
    return FileIdAndName(fileId, name)
}

private fun setUpCsvParser(metadataInputStream: InputStream): CSVParser {
    val csvParser = try {
        CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).get()
            .parse(InputStreamReader(metadataInputStream))
    } catch (e: CSVException) {
        throw invalidTsvFormatException(e)
    }
    return csvParser
}

private fun getValueAndValidateNoWhitespace(record: CSVRecord, fieldName: String, recordNumber: Int): String {
    val fieldValue = record[fieldName]
    if (fieldValue.isNullOrEmpty()) {
        val rowValues = record.toList().joinToString("', '", prefix = "['", postfix = "']")
        throw UnprocessableEntityException(
            "Record #$recordNumber in the metadata file contains no value for '$fieldName'. Row: $rowValues",
        )
    }
    if (fieldValue.any { it.isWhitespace() }) {
        throw UnprocessableEntityException(
            "Record #$recordNumber in the metadata file: the value for '$fieldName' contains whitespace: '$fieldValue'",
        )
    }
    return fieldValue
}

private fun validateMetadataNotEmpty(metadata: Map<String, String>, submissionId: String, recordNumber: Int) {
    if (metadata.isEmpty()) {
        throw UnprocessableEntityException(
            "In metadata file: record #$recordNumber with id $submissionId contains no metadata. This is invalid.",
        )
    }
}

private fun throwWithCsvExceptionUnwrapped(e: Exception): Nothing {
    // CSVException is wrapped in UncheckedIOException during iteration
    val cause = e.cause
    if (cause is CSVException) {
        throw invalidTsvFormatException(cause)
    }
    throw e
}

fun metadataEntryStreamAsSequence(metadataInputStream: InputStream): Sequence<MetadataEntry> {
    val csvParser = setUpCsvParser(metadataInputStream)

    val headerNames = csvParser.headerNames
    val submissionIdHeader = findAndValidateSubmissionIdHeader(headerNames)

    return sequence {
        try {
            csvParser.asSequence().withIndex().forEach { (index, record) ->
                val recordNumber = index + 1 // First data record is #1 (header not counted)

                val submissionId = getValueAndValidateNoWhitespace(record, submissionIdHeader, recordNumber)

                val fastaIds = extractAndValidateFastaIds(record, submissionId, recordNumber)
                val files = extractAndValidateFiles(record, submissionId, recordNumber)

                val metadata = record.toMap().filterKeys {
                    it != submissionIdHeader &&
                        it != FASTA_IDS_HEADER &&
                        !it.startsWith(FILES_HEADER_PREFIX)
                }

                validateMetadataNotEmpty(metadata, submissionId, recordNumber)

                yield(MetadataEntry(submissionId, metadata, fastaIds, files))
            }
        } catch (e: java.io.UncheckedIOException) {
            throwWithCsvExceptionUnwrapped(e)
        }
    }
}

data class RevisionEntry(
    val submissionId: SubmissionId,
    val accession: Accession,
    val metadata: Map<String, String>,
    val fastaIds: Set<FastaId>? = null,
    val files: FileCategoryFilesMap? = null,
)

fun revisionEntryStreamAsSequence(metadataInputStream: InputStream): Sequence<RevisionEntry> {
    val csvParser = setUpCsvParser(metadataInputStream)

    val headerNames = csvParser.headerNames
    val submissionIdHeader = findAndValidateSubmissionIdHeader(headerNames)

    if (!headerNames.contains(ACCESSION_HEADER)) {
        throw UnprocessableEntityException(
            "The revised metadata file does not contain the header '$ACCESSION_HEADER'",
        )
    }

    return sequence {
        try {
            csvParser.asSequence().withIndex().forEach { (index, record) ->
                val recordNumber = index + 1 // First data record is #1 (header not counted)

                val submissionId = getValueAndValidateNoWhitespace(record, submissionIdHeader, recordNumber)
                val accession = getValueAndValidateNoWhitespace(record, ACCESSION_HEADER, recordNumber)

                val fastaIds = extractAndValidateFastaIds(record, submissionId, recordNumber)
                val files = extractAndValidateFiles(record, submissionId, recordNumber)

                val metadata = record.toMap().filterKeys {
                    it != submissionIdHeader && it != ACCESSION_HEADER &&
                        it != FASTA_IDS_HEADER &&
                        !it.startsWith(FILES_HEADER_PREFIX)
                }
                validateMetadataNotEmpty(metadata, submissionId, recordNumber)

                yield(RevisionEntry(submissionId, accession, metadata, fastaIds, files))
            }
        } catch (e: java.io.UncheckedIOException) {
            throwWithCsvExceptionUnwrapped(e)
        }
    }
}
