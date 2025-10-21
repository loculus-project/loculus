package org.loculus.backend.utils

import org.apache.commons.csv.CSVException
import org.apache.commons.csv.CSVFormat
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.model.ACCESSION_HEADER
import org.loculus.backend.model.HEADER_TO_CONNECT_METADATA_AND_SEQUENCES
import org.loculus.backend.model.HEADER_TO_CONNECT_METADATA_AND_SEQUENCES_ALTERNATE_FOR_BACKCOMPAT
import org.loculus.backend.model.SubmissionId
import java.io.InputStream
import java.io.InputStreamReader

data class MetadataEntry(val submissionId: SubmissionId, val metadata: Map<String, String>)

private fun invalidTsvFormatException(originalException: Exception) = UnprocessableEntityException(
    "The metadata file is not a valid TSV file. Common causes include: fields not separated by tabs, " +
        "improperly formatted quoted fields, inconsistent number of fields per row, or empty lines. " +
        "Error: ${originalException.message}",
)

fun findAndValidateSubmissionIdHeader(headerNames: List<String>): String {
    val submissionIdHeaders = listOf(
        HEADER_TO_CONNECT_METADATA_AND_SEQUENCES,
        HEADER_TO_CONNECT_METADATA_AND_SEQUENCES_ALTERNATE_FOR_BACKCOMPAT,
    ).filter { headerNames.contains(it) }

    when {
        submissionIdHeaders.isEmpty() -> throw UnprocessableEntityException(
            "The metadata file does not contain either header '$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES' or '$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES_ALTERNATE_FOR_BACKCOMPAT'",
        )
        submissionIdHeaders.size > 1 -> throw UnprocessableEntityException(
            "The metadata file contains both '$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES' and '$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES_ALTERNATE_FOR_BACKCOMPAT'. Only one is allowed.",
        )
    }
    return submissionIdHeaders.first()
}

fun metadataEntryStreamAsSequence(metadataInputStream: InputStream): Sequence<MetadataEntry> {
    val csvParser = try {
        CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).get()
            .parse(InputStreamReader(metadataInputStream))
    } catch (e: CSVException) {
        throw invalidTsvFormatException(e)
    }

    val headerNames = csvParser.headerNames
    val submissionIdHeader = findAndValidateSubmissionIdHeader(headerNames)

    return sequence {
        try {
            csvParser.asSequence().withIndex().forEach { (index, record) ->
                val recordNumber = index + 1 // First data record is #1 (header not counted)
                val submissionId = record[submissionIdHeader]
                if (submissionId.isNullOrEmpty()) {
                    val rowValues = record.toList().joinToString("', '", prefix = "['", postfix = "']")
                    throw UnprocessableEntityException(
                        "Record #$recordNumber in the metadata file contains no value for '$submissionIdHeader'. Row: $rowValues",
                    )
                }

                if (submissionId.any { it.isWhitespace() }) {
                    throw UnprocessableEntityException(
                        "Record #$recordNumber in the metadata file: the value for '$submissionIdHeader' contains whitespace: '$submissionId'",
                    )
                }

                val metadata = record.toMap().filterKeys { it != submissionIdHeader }
                val entry = MetadataEntry(submissionId, metadata)

                if (entry.metadata.isEmpty()) {
                    throw UnprocessableEntityException(
                        "Record #$recordNumber in the metadata file contains no metadata columns: $entry",
                    )
                }

                yield(entry)
            }
        } catch (e: java.io.UncheckedIOException) {
            // CSVException is wrapped in UncheckedIOException during iteration
            val cause = e.cause
            if (cause is CSVException) {
                throw invalidTsvFormatException(cause)
            }
            throw e
        }
    }
}

data class RevisionEntry(val submissionId: SubmissionId, val accession: Accession, val metadata: Map<String, String>)

fun revisionEntryStreamAsSequence(metadataInputStream: InputStream): Sequence<RevisionEntry> {
    val csvParser = try {
        CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).get()
            .parse(InputStreamReader(metadataInputStream))
    } catch (e: CSVException) {
        throw invalidTsvFormatException(e)
    }

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
                val submissionId = record[submissionIdHeader]
                if (submissionId.isNullOrEmpty()) {
                    val rowValues = record.toList().joinToString("', '", prefix = "['", postfix = "']")
                    throw UnprocessableEntityException(
                        "Record #$recordNumber in the metadata file contains no value for '$submissionIdHeader'. Row: $rowValues",
                    )
                }

                val accession = record[ACCESSION_HEADER]
                if (accession.isNullOrEmpty()) {
                    val rowValues = record.toList().joinToString("', '", prefix = "['", postfix = "']")
                    throw UnprocessableEntityException(
                        "Record #$recordNumber in the metadata file contains no value for '$ACCESSION_HEADER'. Row: $rowValues",
                    )
                }

                val metadata = record.toMap().filterKeys { it != submissionIdHeader && it != ACCESSION_HEADER }
                val entry = RevisionEntry(submissionId, accession, metadata)

                if (entry.metadata.isEmpty()) {
                    throw UnprocessableEntityException(
                        "Record #$recordNumber in the metadata file contains no metadata columns: $entry",
                    )
                }

                yield(entry)
            }
        } catch (e: java.io.UncheckedIOException) {
            // CSVException is wrapped in UncheckedIOException during iteration
            val cause = e.cause
            if (cause is CSVException) {
                throw invalidTsvFormatException(cause)
            }
            throw e
        }
    }
}
