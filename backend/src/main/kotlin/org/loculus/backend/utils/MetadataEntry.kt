package org.loculus.backend.utils

import org.apache.commons.csv.CSVFormat
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.model.ACCESSION_HEADER
import org.loculus.backend.model.FASTA_ID_HEADER
import org.loculus.backend.model.FastaId
import org.loculus.backend.model.METADATA_ID_HEADER
import org.loculus.backend.model.METADATA_ID_HEADER_ALTERNATE_FOR_BACKCOMPAT
import org.loculus.backend.model.SubmissionId
import java.io.InputStream
import java.io.InputStreamReader

data class MetadataEntry(
    val submissionId: SubmissionId,
    val metadata: Map<String, String>,
    val fastaIds: List<FastaId>? = null,
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

fun findAndValidateFastaIdHeader(headerNames: List<String>, submissionIdHeader: String): String {
    if (!headerNames.contains(FASTA_ID_HEADER)) {
        return submissionIdHeader
    }
    return FASTA_ID_HEADER
}

fun metadataEntryStreamAsSequence(metadataInputStream: InputStream, addFastaIds: Boolean = true): Sequence<MetadataEntry> {
    val csvParser = CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).get()
        .parse(InputStreamReader(metadataInputStream))

    val headerNames = csvParser.headerNames
    val submissionIdHeader = findAndValidateSubmissionIdHeader(headerNames)
    val fastaIdHeader = findAndValidateFastaIdHeader(headerNames, submissionIdHeader)

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

        var fastaIds: List<FastaId>? = null

        if (addFastaIds) {
            val fastaId = record[fastaIdHeader]
            if (fastaId.isNullOrEmpty()) {
                throw UnprocessableEntityException(
                    "A row in metadata file contains no $fastaIdHeader: $record",
                )
            }

            fastaIds = fastaId.split(',')
                .map { it.trim() }
                .filter { it.isNotEmpty() }
        }

        val metadata = record.toMap().filterKeys { it!=submissionIdHeader }
        MetadataEntry(submissionId, metadata, fastaIds)
    }.onEach { entry ->
        if (entry.metadata.isEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no metadata columns: $entry",
            )
        }
    }
}

data class RevisionEntry(val submissionId: SubmissionId, val accession: Accession, val metadata: Map<String, String>, val fastaIds: List<FastaId>? = null)

fun revisionEntryStreamAsSequence(metadataInputStream: InputStream, addFastaIds: Boolean): Sequence<RevisionEntry> {
    val csvParser = CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).get()
        .parse(InputStreamReader(metadataInputStream))

    val headerNames = csvParser.headerNames
    val submissionIdHeader = findAndValidateSubmissionIdHeader(headerNames)
    val fastaIdHeader = findAndValidateFastaIdHeader(headerNames, submissionIdHeader)

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

        var fastaIds: List<FastaId>? = null

        if (addFastaIds) {
            val fastaId = record[fastaIdHeader]
            if (fastaId.isNullOrEmpty()) {
                throw UnprocessableEntityException(
                    "A row in metadata file contains no $fastaIdHeader: $record",
                )
            }

            fastaIds = fastaId.split(',')
                .map { it.trim() }
                .filter { it.isNotEmpty() }
        }

        val metadata = record.toMap().filterKeys { it!=submissionIdHeader && it!=ACCESSION_HEADER }
        RevisionEntry(submissionId, accession, metadata, fastaIds)
    }.onEach { entry ->
        if (entry.metadata.isEmpty()) {
            throw UnprocessableEntityException(
                "A row in metadata file contains no metadata columns: $entry",
            )
        }
    }
}
