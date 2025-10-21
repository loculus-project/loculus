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
        CSVFormat.TDF.builder()
            .setHeader()
            .setSkipHeaderRecord(true)
            .get()
            .parse(InputStreamReader(metadataInputStream, Charsets.UTF_8))
    } catch (e: CSVException) {
        throw UnprocessableEntityException(
            "Metadata TSV is malformed: ${e.message}. " +
                "Make sure the file is tab-delimited, not space-separated or mixed with spaces.",
        )
    }

    val headerNames = csvParser.headerNames
    val submissionIdHeader = findAndValidateSubmissionIdHeader(headerNames)

    return csvParser.asSequence().map { record ->
        val submissionId = record[submissionIdHeader]
        if (submissionId.isNullOrEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no $submissionIdHeader: $record",
            )
        }

        if (submissionId.any { it.isWhitespace() }) {
            throw UnprocessableEntityException(
                "A value for $submissionIdHeader contains whitespace: $record",
            )
        }

        val metadata = record.toMap().filterKeys { it != submissionIdHeader }
        MetadataEntry(submissionId, metadata)
    }.onEach { entry ->
        if (entry.metadata.isEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no metadata columns: $entry",
            )
        }
    }
}

data class RevisionEntry(val submissionId: SubmissionId, val accession: Accession, val metadata: Map<String, String>)

fun revisionEntryStreamAsSequence(metadataInputStream: InputStream): Sequence<RevisionEntry> {
    val csvParser = CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).get()
        .parse(InputStreamReader(metadataInputStream))

    val headerNames = csvParser.headerNames
    val submissionIdHeader = findAndValidateSubmissionIdHeader(headerNames)

    if (!headerNames.contains(ACCESSION_HEADER)) {
        throw UnprocessableEntityException(
            "The revised metadata file does not contain the header '$ACCESSION_HEADER'",
        )
    }

    return csvParser.asSequence().map { record ->
        val submissionId = record[submissionIdHeader]
        if (submissionId.isNullOrEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no $submissionIdHeader: $record",
            )
        }

        val accession = record[ACCESSION_HEADER]
        if (accession.isNullOrEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no $ACCESSION_HEADER: $record",
            )
        }

        val metadata = record.toMap().filterKeys { it != submissionIdHeader && it != ACCESSION_HEADER }
        RevisionEntry(submissionId, accession, metadata)
    }.onEach { entry ->
        if (entry.metadata.isEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no metadata columns: $entry",
            )
        }
    }
}
