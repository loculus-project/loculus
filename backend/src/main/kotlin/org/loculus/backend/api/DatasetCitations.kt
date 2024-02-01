package org.loculus.backend.api

import java.sql.Timestamp
import java.util.UUID

data class SubmittedDatasetRecord(
    val accession: String,
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
    val datasetDOI: String?,
)

data class ResponseDataset(
    val datasetId: String,
    val datasetVersion: Long,
)

data class CitedBy(
    val years: MutableList<Long>,
    val citations: MutableList<Long>,
)

data class Author(
    val authorId: UUID,
    val name: String,
    val affiliation: String,
    val email: String,
    val emailVerified: Boolean,
    val username: String?,
    val createdAt: Timestamp,
    val createdBy: String,
    val updatedAt: Timestamp,
    val updatedBy: String,
)

data class SubmittedAuthor(
    val name: String,
    val affiliation: String,
    val email: String,
    val emailVerified: Boolean,
)

data class SubmittedAuthorUpdate(
    val name: String,
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
