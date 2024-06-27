package org.loculus.backend.utils

import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.model.ACCESSION_HEADER
import org.loculus.backend.model.HEADER_TO_CONNECT_METADATA_AND_SEQUENCES
import org.loculus.backend.model.SubmissionId
import java.io.InputStream
import java.io.InputStreamReader

data class MetadataEntry(val submissionId: SubmissionId, val metadata: Map<String, String>)

fun metadataEntryStreamAsSequence(metadataInputStream: InputStream): Sequence<MetadataEntry> {
    val csvParser = CSVParser(
        InputStreamReader(metadataInputStream),
        CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).build(),
    )

    if (!csvParser.headerNames.contains(HEADER_TO_CONNECT_METADATA_AND_SEQUENCES)) {
        throw UnprocessableEntityException(
            "The metadata file does not contain the header '$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES'",
        )
    }

    return csvParser.asSequence().map { record ->
        val submissionId = record[HEADER_TO_CONNECT_METADATA_AND_SEQUENCES]

        if (submissionId.isNullOrEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no $HEADER_TO_CONNECT_METADATA_AND_SEQUENCES: $record",
            )
        }

        val metadata = record.toMap().filterKeys { column ->
            column != HEADER_TO_CONNECT_METADATA_AND_SEQUENCES
        }

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
    val csvParser = CSVParser(
        InputStreamReader(metadataInputStream),
        CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).build(),
    )

    if (!csvParser.headerNames.contains(HEADER_TO_CONNECT_METADATA_AND_SEQUENCES)) {
        throw UnprocessableEntityException(
            "The revised metadata file does not contain the header '$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES'",
        )
    }

    if (!csvParser.headerNames.contains(ACCESSION_HEADER)) {
        throw UnprocessableEntityException(
            "The revised metadata file does not contain the header '$ACCESSION_HEADER'",
        )
    }

    return csvParser.asSequence().map { record ->
        val submissionId = record[HEADER_TO_CONNECT_METADATA_AND_SEQUENCES]

        if (submissionId.isNullOrEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no $HEADER_TO_CONNECT_METADATA_AND_SEQUENCES: $record",
            )
        }

        val accession = record[ACCESSION_HEADER]

        if (accession.isNullOrEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no $ACCESSION_HEADER: $record",
            )
        }

        val metadata = record.toMap().filterKeys { column ->
            column != HEADER_TO_CONNECT_METADATA_AND_SEQUENCES &&
                column != ACCESSION_HEADER
        }

        RevisionEntry(submissionId, accession, metadata)
    }.onEach { entry ->
        if (entry.metadata.isEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no metadata columns: $entry",
            )
        }
    }
}
