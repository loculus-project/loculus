package org.loculus.backend.service.datasetcitations

import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toJavaLocalDateTime
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.Author
import org.loculus.backend.api.CitedBy
import org.loculus.backend.api.Dataset
import org.loculus.backend.api.DatasetCitationsConstants
import org.loculus.backend.api.DatasetRecord
import org.loculus.backend.api.ResponseAuthor
import org.loculus.backend.api.ResponseDataset
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.SubmittedDatasetRecord
import org.loculus.backend.controller.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.util.UUID
import javax.sql.DataSource

private val log = KotlinLogging.logger { }

@Service
@Transactional
class DatasetCitationsDatabaseService(
    pool: DataSource,
) {
    init {
        Database.connect(pool)
    }

    fun createDataset(
        username: String,
        datasetName: String,
        datasetRecords: List<SubmittedDatasetRecord>,
        datasetDescription: String?,
    ): ResponseDataset {
        log.info { "Create dataset $datasetName, user $username" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val insertedSet = DatasetsTable
            .insert {
                it[DatasetsTable.name] = datasetName
                it[DatasetsTable.description] = datasetDescription ?: ""
                it[DatasetsTable.datasetVersion] = 1
                it[DatasetsTable.createdAt] = now
                it[DatasetsTable.createdBy] = username
            }

        for (record in datasetRecords) {
            val insertedRecord = DatasetRecordsTable
                .insert {
                    it[DatasetRecordsTable.accession] = record.accession
                    it[DatasetRecordsTable.type] = record.type
                }
            DatasetToRecordsTable
                .insert {
                    it[DatasetToRecordsTable.datasetRecordId] = insertedRecord[DatasetRecordsTable.datasetRecordId]
                    it[DatasetToRecordsTable.datasetId] = insertedSet[DatasetsTable.datasetId]
                    it[DatasetToRecordsTable.datasetVersion] = 1
                }
        }

        return ResponseDataset(
            insertedSet[DatasetsTable.datasetId].toString(),
            insertedSet[DatasetsTable.datasetVersion],
        )
    }

    fun updateDataset(
        username: String,
        datasetId: String,
        datasetName: String,
        datasetRecords: List<SubmittedDatasetRecord>,
        datasetDescription: String?,
    ): ResponseDataset {
        log.info { "Update dataset $datasetId, user $username" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val maxVersion = DatasetsTable
            .slice(DatasetsTable.datasetVersion.max())
            .select { DatasetsTable.datasetId eq UUID.fromString(datasetId) }
            .firstOrNull()
            ?.get(DatasetsTable.datasetVersion.max())

        if (maxVersion == null) {
            throw NotFoundException("Dataset $datasetId does not exist")
        }

        val version = maxVersion + 1

        val insertedSet = DatasetsTable
            .insert {
                it[DatasetsTable.datasetId] = UUID.fromString(datasetId)
                it[DatasetsTable.name] = datasetName
                it[DatasetsTable.description] = datasetDescription ?: ""
                it[DatasetsTable.datasetVersion] = version
                it[DatasetsTable.createdAt] = now
                it[DatasetsTable.createdBy] = username
            }

        for (record in datasetRecords) {
            val existingRecord = DatasetRecordsTable
                .select { DatasetRecordsTable.accession eq record.accession }
                .singleOrNull()

            var datasetRecordId: Long

            if (existingRecord == null) {
                val insertedRecord = DatasetRecordsTable
                    .insert {
                        it[DatasetRecordsTable.accession] = record.accession
                        it[DatasetRecordsTable.type] = record.type
                    }
                datasetRecordId = insertedRecord[DatasetRecordsTable.datasetRecordId]
            } else {
                datasetRecordId = existingRecord[DatasetRecordsTable.datasetRecordId]
            }

            DatasetToRecordsTable
                .insert {
                    it[DatasetToRecordsTable.datasetVersion] = version
                    it[DatasetToRecordsTable.datasetId] = insertedSet[DatasetsTable.datasetId]
                    it[DatasetToRecordsTable.datasetRecordId] = datasetRecordId
                }
        }

        return ResponseDataset(
            insertedSet[DatasetsTable.datasetId].toString(),
            insertedSet[DatasetsTable.datasetVersion],
        )
    }

    fun getDataset(datasetId: String, version: Long?): List<Dataset> {
        log.info { "Get dataset $datasetId, version $version" }

        val query = DatasetsTable
            .select {
                DatasetsTable.datasetId eq UUID.fromString(datasetId)
            }

        if (version != null) {
            query.andWhere { DatasetsTable.datasetVersion eq version }
        }

        if (query.empty()) {
            throw NotFoundException("Dataset $datasetId, version $version does not exist")
        }

        return query.map { row ->
            Dataset(
                row[DatasetsTable.datasetId],
                row[DatasetsTable.datasetVersion],
                row[DatasetsTable.name],
                Timestamp.valueOf(row[DatasetsTable.createdAt].toJavaLocalDateTime()),
                row[DatasetsTable.createdBy],
                row[DatasetsTable.description],
                row[DatasetsTable.datasetDOI],
            )
        }
    }

    fun getDatasetRecords(datasetId: String, version: Long?): List<DatasetRecord> {
        log.info { "Get dataset records for dataset $datasetId, version $version" }

        var selectedVersion = version

        if (selectedVersion == null) {
            selectedVersion = DatasetsTable
                .slice(DatasetsTable.datasetVersion.max())
                .select { DatasetsTable.datasetId eq UUID.fromString(datasetId) }
                .singleOrNull()?.get(DatasetsTable.datasetVersion)
        }
        if (selectedVersion == null) {
            throw NotFoundException("Dataset $datasetId, version $version does not exist")
        }

        val selectedDatasetRecords = DatasetToRecordsTable
            .innerJoin(DatasetRecordsTable)
            .select {
                (DatasetToRecordsTable.datasetId eq UUID.fromString(datasetId)) and
                    (DatasetToRecordsTable.datasetVersion eq selectedVersion)
            }
            .map {
                DatasetRecord(
                    it[DatasetRecordsTable.datasetRecordId],
                    it[DatasetRecordsTable.accession],
                    it[DatasetRecordsTable.type],
                )
            }

        return selectedDatasetRecords
    }

    fun getDatasets(username: String): List<Dataset> {
        log.info { "Get datasets for user $username" }

        val datasetList = mutableListOf<Dataset>()
        val selectedDatasets = DatasetsTable
            .select { DatasetsTable.createdBy eq username }

        selectedDatasets.forEach {
            datasetList.add(
                Dataset(
                    it[DatasetsTable.datasetId],
                    it[DatasetsTable.datasetVersion],
                    it[DatasetsTable.name],
                    Timestamp.valueOf(it[DatasetsTable.createdAt].toJavaLocalDateTime()),
                    it[DatasetsTable.createdBy],
                    it[DatasetsTable.description],
                    it[DatasetsTable.datasetDOI],
                ),
            )
        }
        return datasetList
    }

    fun deleteDataset(username: String, datasetId: String, version: Long) {
        log.info { "Delete dataset $datasetId, version $version, user $username" }

        DatasetsTable.deleteWhere {
            (DatasetsTable.datasetId eq UUID.fromString(datasetId)) and
                (DatasetsTable.datasetVersion eq version) and
                (DatasetsTable.createdBy eq username)
        }
    }

    fun createDatasetDOI(username: String, datasetId: String, version: Long): ResponseDataset {
        log.info { "Create DOI for dataset $datasetId, version $version, user $username" }

        val datasetDOI = "${DatasetCitationsConstants.DOI_PREFIX}/$datasetId.$version"

        DatasetsTable.update({
            (DatasetsTable.datasetId eq UUID.fromString(datasetId)) and
                (DatasetsTable.datasetVersion eq version) and
                (DatasetsTable.createdBy eq username)
        }) {
            it[DatasetsTable.datasetDOI] = datasetDOI
        }

        return ResponseDataset(
            datasetId,
            version,
        )
    }

    fun getUserCitedByDataset(accessions: List<SequenceEntryStatus>): CitedBy {
        log.info { "Get user cited by dataset" }
        data class EnrichedDatasetRecord(
            val accession: String,
            val datasetId: UUID,
            val datasetVersion: Long,
            val createdAt: Timestamp,
        )
        val selectedDatasetRecords = DatasetRecordsTable
            .innerJoin(DatasetToRecordsTable)
            .innerJoin(DatasetsTable)
            .select(
                where = {
                    DatasetRecordsTable.accession inList accessions.map { it.accession.plus('.').plus(it.version) }
                },
            )
            .map {
                EnrichedDatasetRecord(
                    it[DatasetRecordsTable.accession],
                    it[DatasetsTable.datasetId],
                    it[DatasetsTable.datasetVersion],
                    Timestamp.valueOf(it[DatasetsTable.createdAt].toJavaLocalDateTime()),
                )
            }

        val datasetMap = mutableMapOf<String, MutableList<Dataset>>()

        for (record in selectedDatasetRecords) {
            val accession = record.accession
            val datasetList = datasetMap.computeIfAbsent(accession) { mutableListOf() }

            val dataset = Dataset(
                record.datasetId,
                record.datasetVersion,
                "",
                record.createdAt,
                "",
                "",
                "",
            )

            if (!datasetList.contains(dataset)) {
                datasetList.add(dataset)
            }
        }

        val uniqueLatestDatasets = mutableListOf<Dataset>()
        for (entry in datasetMap) {
            val datasets = entry.value
            val latestVersion = datasets.maxByOrNull { it.datasetVersion }
            if (latestVersion != null && !uniqueLatestDatasets.contains(latestVersion)) {
                uniqueLatestDatasets.add(latestVersion)
            }
        }

        val citedBy = CitedBy(
            mutableListOf<Long>(),
            mutableListOf<Long>(),
        )
        for (dataset in uniqueLatestDatasets) {
            val year = dataset.createdAt.toLocalDateTime().year.toLong()
            if (citedBy.years.contains(year)) {
                val index = citedBy.years.indexOf(year)
                while (index >= citedBy.citations.size) {
                    citedBy.citations.add(0)
                }
                citedBy.citations[index] = citedBy.citations[index] + 1
            } else {
                citedBy.years.add(year)
                citedBy.citations.add(1)
            }
        }
        return citedBy
    }

    fun getDatasetCitedByPublication(datasetId: String, version: Long): CitedBy {
        log.info { "Get dataset cited by publication for datasetId $datasetId, version $version" }

        val citedBy = CitedBy(
            mutableListOf<Long>(),
            mutableListOf<Long>(),
        )

        return citedBy
    }

    fun getAuthor(username: String): List<Author> {
        val authorList = mutableListOf<Author>()
        val selectedAuthors = AuthorsTable
            .select(
                where = { AuthorsTable.username eq username },
            )
        val selectedAuthor = selectedAuthors.firstOrNull()

        if (selectedAuthor == null) {
            throw NotFoundException("Author $username does not exist")
        }

        authorList.add(
            Author(
                selectedAuthor[AuthorsTable.authorId],
                selectedAuthor[AuthorsTable.name],
                selectedAuthor[AuthorsTable.affiliation],
                selectedAuthor[AuthorsTable.email],
                selectedAuthor[AuthorsTable.emailVerified],
                selectedAuthor[AuthorsTable.username],
                Timestamp.valueOf(selectedAuthor[AuthorsTable.createdAt].toJavaLocalDateTime()),
                selectedAuthor[AuthorsTable.createdBy],
                Timestamp.valueOf(selectedAuthor[AuthorsTable.updatedAt].toJavaLocalDateTime()),
                selectedAuthor[AuthorsTable.updatedBy],
            ),
        )
        return authorList
    }

    fun createAuthor(
        username: String,
        name: String,
        email: String,
        emailVerified: Boolean,
        affiliation: String,
    ): ResponseAuthor {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val insert = AuthorsTable
            .insert {
                it[AuthorsTable.name] = name
                it[AuthorsTable.affiliation] = affiliation
                it[AuthorsTable.email] = email
                it[AuthorsTable.emailVerified] = emailVerified
                it[AuthorsTable.username] = username
                it[AuthorsTable.createdAt] = now
                it[AuthorsTable.createdBy] = username
                it[AuthorsTable.updatedAt] = now
                it[AuthorsTable.updatedBy] = "nobody"
            }
        return ResponseAuthor(
            insert[AuthorsTable.authorId].toString(),
        )
    }

    fun updateAuthor(
        username: String,
        authorId: String,
        name: String,
        email: String,
        emailVerified: Boolean,
        affiliation: String,
    ): ResponseAuthor {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        AuthorsTable
            .update(
                where = {
                    (AuthorsTable.username eq username) and
                        (AuthorsTable.authorId eq UUID.fromString(authorId))
                },
            ) {
                it[AuthorsTable.affiliation] = affiliation
                it[AuthorsTable.email] = email
                it[AuthorsTable.emailVerified] = emailVerified
                it[AuthorsTable.name] = name
                it[AuthorsTable.updatedAt] = now
                it[AuthorsTable.updatedBy] = username
            }
        return ResponseAuthor(
            authorId,
        )
    }

    fun deleteAuthor(username: String, authorId: String) {
        AuthorsTable.deleteWhere {
            (AuthorsTable.username eq username) and
                (AuthorsTable.authorId eq UUID.fromString(authorId))
        }
    }
}
