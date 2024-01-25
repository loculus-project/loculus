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
import org.loculus.backend.api.AuthorProfile
import org.loculus.backend.api.CitedBy
import org.loculus.backend.api.Dataset
import org.loculus.backend.api.DatasetCitationsConstants
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
            throw IllegalArgumentException("Dataset $datasetId does not exist")
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
                        Timestamp.valueOf(it[DatasetsTable.createdAt].toJavaLocalDateTime()),
                        it[DatasetsTable.createdBy],
                        it[DatasetsTable.description],
                        it[DatasetsTable.datasetDOI],
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
                throw IllegalArgumentException("Dataset $datasetId, version $version does not exist")
            }

            datasetList.add(
                Dataset(
                    selectedDataset[DatasetsTable.datasetId],
                    selectedDataset[DatasetsTable.datasetVersion],
                    selectedDataset[DatasetsTable.name],
                    Timestamp.valueOf(selectedDataset[DatasetsTable.createdAt].toJavaLocalDateTime()),
                    selectedDataset[DatasetsTable.createdBy],
                    selectedDataset[DatasetsTable.description],
                    selectedDataset[DatasetsTable.datasetDOI],
                ),
            )
        }
        return datasetList
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
            throw IllegalArgumentException("Dataset $datasetId, version $version does not exist")
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
        log.info { "Get datasets for user $username" }

        var datasetList = mutableListOf<Dataset>()
        var selectedDatasets = DatasetsTable
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

        // TODO: Register with DOI agency (crossref)
        // Include URL to dataset on app in crossref metadata

        return ResponseDataset(
            datasetId,
            version,
        )
    }

    fun getUserCitedByDataset(username: String): CitedBy {
        log.info { "Get user cited by dataset for username $username" }

        // TODO: implement using sequences table + datasets table
        var citedBy = CitedBy()
        return citedBy
    }

    fun getDatasetCitedByPublication(datasetId: String, version: Long): CitedBy {
        log.info { "Get dataset cited by publication for datasetId $datasetId, version $version" }

        // TODO: implement using CrossRef API: https://www.crossref.org/services/cited-by/
        var citedBy = CitedBy()
        return citedBy
    }

    fun getAuthorProfiles(authorQuery: String): List<AuthorProfile> {
        log.info { "Get author profiles matching query $authorQuery" }

        // TODO: implement using SerpAPI: https://serpapi.com/google-scholar-profiles-api
        var authorList = mutableListOf<AuthorProfile>()
        return authorList
    }

    fun getAuthorProfile(authorId: String): AuthorProfile? {
        log.info { "Get author profile with id $authorId" }
        // TODO: implement using SerpAPI: https://serpapi.com/google-scholar-author-api
        return null
    }

    fun setAuthorProfile(username: String, authorId: String) {
        log.info { "Set author profile with id $authorId to username $username" }
        // TODO: implement using keycloak custom user attributes
        return
    }

    fun createAuthor(affiliation: String, email: String, name: String): Long {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val insert = AuthorsTable
            .insert {
                it[AuthorsTable.affiliation] = affiliation
                it[AuthorsTable.email] = email
                it[AuthorsTable.name] = name
                it[AuthorsTable.createdAt] = now
                it[AuthorsTable.createdBy] = "nobody"
                it[AuthorsTable.updatedAt] = now
                it[AuthorsTable.updatedBy] = "nobody"
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

    fun updateAuthor(authorId: Long, affiliation: String, email: String, name: String) {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        AuthorsTable
            .update(
                where = { AuthorsTable.authorId eq authorId },
            ) {
                it[AuthorsTable.affiliation] = affiliation
                it[AuthorsTable.email] = email
                it[AuthorsTable.name] = name
                it[AuthorsTable.updatedAt] = now
                it[AuthorsTable.updatedBy] = "nobody"
            }
    }

    fun deleteAuthor(_authorId: Long) {
        AuthorsTable.deleteWhere { authorId eq _authorId }
    }
}
