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

data class Citation(
    val citationId: Long,
    val data: String,
    val type: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val updatedAt: Timestamp,
    val updatedBy: String,
)

data class CitedBy(
    val years: List<Long> = mutableListOf<Long>(),
    val citations: List<Long> = mutableListOf<Long>(),
)

data class Author(
    val authorId: Long,
    val affiliation: String,
    val email: String,
    val name: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val updatedAt: Timestamp,
    val updatedBy: String,
)


object DatsetCitationsConstants {
    const val DOI_PREFIX = "placeholder"
}