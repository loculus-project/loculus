package org.loculus.backend.api

import io.swagger.v3.oas.annotations.media.Schema
import java.sql.Timestamp
import java.util.UUID

data class SubmittedDatasetRecord(
    val accession: String,
    @Schema(
        description = "The type of the accession.",
        type = "string",
        example = "GenBank",
    )
    val type: String,
)

data class SubmittedDataset(
    val name: String,
    val description: String,
    val records: List<SubmittedDatasetRecord>,
)

data class SubmittedDatasetUpdate(
    val datasetId: String,
    val name: String,
    val description: String,
    val records: List<SubmittedDatasetRecord>,
)

data class DatasetRecord(
    val datasetRecordId: Long,
    val accession: String,
    val type: String,
)

data class Dataset(
    val datasetId: UUID,
    val datasetVersion: Long,
    val name: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val description: String?,
    @Schema(
        description = "The DOI of the dataset.",
        type = "string",
        example = "10.1234/5678",
    )
    val datasetDOI: String?,
)

data class ResponseDataset(
    val datasetId: String,
    val datasetVersion: Long,
)

data class CitedBy(
    @Schema(
        description = "The years in which the dataset or sequence was cited.",
        type = "array",
        example = "[2000, 2001, 2002]",
    )
    val years: MutableList<Long>,
    @Schema(
        description = "The number of citations per year.",
        type = "array",
        example = "[1, 2, 3]",
    )
    val citations: MutableList<Long>,
)

data class Author(
    val authorId: UUID,
    val name: String,
    @Schema(
        description = "The affiliation of the author.",
        type = "string",
        example = "Professor at University of Example",
    )
    val affiliation: String,
    val email: String,
    val emailVerified: Boolean,
    val username: String?,
    val createdAt: Timestamp,
    val createdBy: String,
    val updatedAt: Timestamp,
    val updatedBy: String?,
)

data class SubmittedAuthor(
    val name: String,
    @Schema(
        description = "The affiliation of the author.",
        type = "string",
        example = "Professor at University of Example",
    )
    val affiliation: String,
    val email: String,
    val emailVerified: Boolean,
)

data class SubmittedAuthorUpdate(
    val name: String,
    @Schema(
        description = "The affiliation of the author.",
        type = "string",
        example = "Professor at University of Example",
    )
    val affiliation: String,
    val email: String,
    val emailVerified: Boolean,
)

data class ResponseAuthor(
    val authorId: String,
)

object DatasetCitationsConstants {
    const val DOI_PREFIX = "placeholder"
}
