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
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.Author
import org.loculus.backend.api.Citation
import org.loculus.backend.api.CitedBy
import org.loculus.backend.api.Dataset 
import org.loculus.backend.api.DatsetCitationsConstants
import org.loculus.backend.api.DatasetRecord
import org.loculus.backend.api.ResponseDataset
import org.loculus.backend.api.SubmittedDatasetRecord
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
    // private val sequenceEntriesTableProvider: SequenceEntriesTableProvider,
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
        log.info { "creating dataset $datasetName, user $username" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val insertedSet = DatasetsTable
            .insert {
                it[name] = datasetName
                it[description] = datasetDescription ?: ""
                it[datasetVersion] = 1
                it[createdAt] = now
                it[createdBy] = username
            }

        for (record in datasetRecords) {
            val insertedRecord = DatasetRecordsTable
                .insert {
                    it[accession] = record.accession
                    it[type] = record.type
                }
            DatasetToRecordsTable
                .insert {
                    it[datasetRecordId] = insertedRecord[DatasetRecordsTable.datasetRecordId]
                    it[datasetId] = insertedSet[DatasetsTable.datasetId]
                    it[datasetVersion] = 1
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
        log.info { "updating dataset $datasetName, user $username" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val maxVersion = DatasetsTable
            .slice(DatasetsTable.datasetVersion.max())
            .select { DatasetsTable.datasetId eq UUID.fromString(datasetId) }
            .firstOrNull()
            ?.get(DatasetsTable.datasetVersion.max())

        if (maxVersion == null) {
            throw IllegalArgumentException("Dataset set $datasetId does not exist")
        }

        val version = maxVersion + 1

        val insertedSet = DatasetsTable
            .insert {
                it[name] = datasetName
                it[description] = datasetDescription ?: ""
                it[datasetVersion] = version
                it[createdAt] = now
                it[createdBy] = username
            }

        for (record in datasetRecords) {
            val existingRecord = DatasetRecordsTable
                .select { DatasetRecordsTable.accession eq record.accession }
                .singleOrNull()

            var datasetRecordId: Long

            if (existingRecord == null) {
                val insertedRecord = DatasetRecordsTable
                    .insert {
                        it[accession] = record.accession
                        it[type] = record.type
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

        var datasetList = mutableListOf<Dataset>()

        if (version == null) {
            var selectedDatasets = DatasetsTable
                .select {
                    DatasetsTable.datasetId eq UUID.fromString(datasetId)
                }
            selectedDatasets.forEach {
                datasetList.add(
                    Dataset(
                        it[DatasetsTable.datasetId],
                        it[DatasetsTable.datasetVersion],
                        it[DatasetsTable.name],
                        it[DatasetsTable.description],
                        Timestamp.valueOf(it[DatasetsTable.createdAt].toJavaLocalDateTime()),
                        it[DatasetsTable.createdBy],
                    ),
                )
            }
        } else {
            var selectedDataset = DatasetsTable
                .select {
                    (DatasetsTable.datasetId eq UUID.fromString(datasetId)) and
                        (DatasetsTable.datasetVersion eq version)
                }.singleOrNull()

            if (selectedDataset == null) {
                throw IllegalArgumentException("Dataset set $datasetId does not exist")
            }

            datasetList.add(
                Dataset(
                    selectedDataset[DatasetsTable.datasetId],
                    selectedDataset[DatasetsTable.datasetVersion],
                    selectedDataset[DatasetsTable.name],
                    selectedDataset[DatasetsTable.description],
                    Timestamp.valueOf(selectedDataset[DatasetsTable.createdAt].toJavaLocalDateTime()),
                    selectedDataset[DatasetsTable.createdBy],
                ),
            )
        }
        return datasetList
    }

    fun getDatasetRecords(datasetId: String, version: Long?): List<DatasetRecord> {
        log.info { "Get dataset records $datasetId, version $version" }

        var selectedVersion = version

        if (selectedVersion == null) {
            selectedVersion = DatasetsTable
                .slice(DatasetsTable.datasetVersion.max())
                .select { DatasetsTable.datasetId eq UUID.fromString(datasetId) }
                .singleOrNull()?.get(DatasetsTable.datasetVersion)
        }
        if (selectedVersion == null) {
            throw IllegalArgumentException("Dataset set $datasetId does not exist")
        }

        // TODO: join with sequenceEntries without needing organism
        var selectedDatasetRecords = DatasetToRecordsTable
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
        var datasetList = mutableListOf<Dataset>()
        var selectedDatasets = DatasetsTable
            .select { DatasetsTable.createdBy eq username }

        selectedDatasets.forEach {
            datasetList.add(
                Dataset(
                    it[DatasetsTable.datasetId],
                    it[DatasetsTable.datasetVersion],
                    it[DatasetsTable.name],
                    it[DatasetsTable.description],
                    Timestamp.valueOf(it[DatasetsTable.createdAt].toJavaLocalDateTime()),
                    it[DatasetsTable.createdBy],
                ),
            )
        }
        return datasetList
    }

    fun deleteDataset(username: String, datasetId: String, version: Long) {
        DatasetsTable.deleteWhere {
            (DatasetsTable.datasetId eq UUID.fromString(datasetId)) and
                (DatasetsTable.datasetVersion eq version) and
                (DatasetsTable.createdBy eq username)
        }
    }


    fun createDatasetDOI(
        username: String,
        datasetId: String,
        version: Long,
    ): ResponseDataset {
        log.info { "Create DOI for dataset $datasetId, user $username" }

        val datasetDOI = "$DatsetCitationsConstants.DOI_PREFIX/$datasetId.$version"

        log.info { "Debug DOI $datasetDOI" }

        DatasetsTable.update (
            {
                (DatasetsTable.datasetId eq UUID.fromString(datasetId)) and
                (DatasetsTable.datasetVersion eq version) and
                (DatasetsTable.createdBy eq username)
            }
        ) {
            it[DatasetsTable.datasetDOI] = datasetDOI
        }

        // TODO: Register with DOI agency (crossref)
        // Include URL to dataset on app in crossref metadata

        return ResponseDataset(
            datasetId,
            version,
        )
    }

    fun getDatasetCitedBy(datasetId: String, version: Long): CitedBy {
        // TODO: implement using CrossRef API: https://www.crossref.org/services/cited-by/
        var citedBy = CitedBy()
        return citedBy
    }

    fun getUserCitedBy(username: String): CitedBy {
        // TODO: implement using sequences table + datasets table + CrossRef API: https://www.crossref.org/services/cited-by/
        var citedBy = CitedBy()
        return citedBy
    }

    fun createAuthor(_affiliation: String, _email: String, _name: String): Long {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val insert = AuthorsTable
            .insert {
                it[affiliation] = _affiliation
                it[email] = _email
                it[name] = _name
                it[createdAt] = now
                it[createdBy] = "nobody"
                it[updatedAt] = now
                it[updatedBy] = "nobody"
            }

        return insert[AuthorsTable.authorId]
    }

    fun getAuthor(authorId: Long): List<Author> {
        var authorList = mutableListOf<Author>()
        var selectedAuthors = AuthorsTable
            .select(
                where = { AuthorsTable.authorId eq authorId },
            )
        var selectedAuthor = selectedAuthors.single()
        authorList.add(
            Author(
                selectedAuthor[AuthorsTable.authorId],
                selectedAuthor[AuthorsTable.affiliation],
                selectedAuthor[AuthorsTable.email],
                selectedAuthor[AuthorsTable.name],
                Timestamp.valueOf(selectedAuthor[AuthorsTable.createdAt].toJavaLocalDateTime()),
                selectedAuthor[AuthorsTable.createdBy],
                Timestamp.valueOf(selectedAuthor[AuthorsTable.updatedAt].toJavaLocalDateTime()),
                selectedAuthor[AuthorsTable.updatedBy],
            ),
        )
        return authorList
    }

    fun updateAuthor(authorId: Long, _affiliation: String, _email: String, _name: String) {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        AuthorsTable
            .update(
                where = { AuthorsTable.authorId eq authorId },
            ) {
                it[affiliation] = _affiliation
                it[email] = _email
                it[name] = _name
                it[updatedAt] = now
                it[updatedBy] = "nobody"
            }
    }

    fun deleteAuthor(_authorId: Long) {
        AuthorsTable.deleteWhere { authorId eq _authorId }
    }
}
